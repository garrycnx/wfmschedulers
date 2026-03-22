import { useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Area, ComposedChart
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { IntervalDataPoint } from '../../api/forecastApi'
import { clsx } from 'clsx'

interface DailyIntervalChartProps {
  intervalData: IntervalDataPoint[]
  selectedDay: string
  allDates: string[]
  onPrevDay: () => void
  onNextDay: () => void
  intervalMinutes: number
}

// Peak reference lines work for both 15-min and 30-min grids
const PEAK_HOURS_15 = ['09:30', '09:45', '10:00', '14:00', '14:15', '14:30', '15:00', '15:15']
const PEAK_HOURS_30 = ['09:30', '10:00', '14:00', '14:30', '15:00']

export default function DailyIntervalChart({
  intervalData, selectedDay, allDates, onPrevDay, onNextDay, intervalMinutes
}: DailyIntervalChartProps) {
  const dayData = useMemo(() =>
    intervalData.filter(d => d.date === selectedDay).sort((a, b) => a.time.localeCompare(b.time)),
    [intervalData, selectedDay]
  )

  const chartData = useMemo(() => dayData.map(d => ({
    time: d.time,
    calls: Math.round(d.calls),
  })), [dayData])

  const totalCalls = useMemo(() => dayData.reduce((s, d) => s + d.calls, 0), [dayData])
  const peakSlot = useMemo(() => dayData.reduce((best, d) => d.calls > (best?.calls ?? 0) ? d : best, dayData[0]), [dayData])
  const avgCalls = useMemo(() => dayData.length ? totalCalls / dayData.length : 0, [totalCalls, dayData])

  const currentIdx = allDates.indexOf(selectedDay)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < allDates.length - 1

  const displayDate = (() => {
    try { return format(parseISO(selectedDay), 'EEEE, MMMM d, yyyy') }
    catch { return selectedDay }
  })()

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-lg">
        <p className="font-semibold text-indigo-300 mb-1">{label}</p>
        <p className="text-white">{payload[0]?.value?.toLocaleString()} calls / {intervalMinutes} min</p>
        <p className="text-gray-400">{Math.round((payload[0]?.value ?? 0) * (60 / intervalMinutes))} calls / hour</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with nav */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{displayDate}</h3>
          <p className="text-xs text-gray-500">{intervalMinutes}-minute interval breakdown</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onPrevDay} disabled={!hasPrev}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors', hasPrev ? 'border-gray-200 text-gray-600 hover:bg-gray-50' : 'border-gray-100 text-gray-300 cursor-not-allowed')}
          >← Prev</button>
          <button onClick={onNextDay} disabled={!hasNext}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors', hasNext ? 'border-gray-200 text-gray-600 hover:bg-gray-50' : 'border-gray-100 text-gray-300 cursor-not-allowed')}
          >Next →</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Calls', value: Math.round(totalCalls).toLocaleString(), color: 'text-indigo-700' },
          { label: 'Peak Interval', value: peakSlot ? `${peakSlot.time} (${Math.round(peakSlot.calls).toLocaleString()})` : '—', color: 'text-red-600' },
          { label: 'Avg / Interval', value: Math.round(avgCalls).toLocaleString(), color: 'text-emerald-700' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-gray-50 rounded-xl px-3 py-2.5">
            <p className="text-xs text-gray-400">{kpi.label}</p>
            <p className={clsx('text-sm font-bold mt-0.5', kpi.color)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="intervalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={intervalMinutes === 15 ? 3 : 1} />
          <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={45}
            tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)} />
          <Tooltip content={<CustomTooltip />} />
          {(intervalMinutes === 15 ? PEAK_HOURS_15 : PEAK_HOURS_30).map(h => (
            <ReferenceLine key={h} x={h} stroke="#fbbf24" strokeDasharray="4 2" strokeWidth={1} />
          ))}
          <Area dataKey="calls" fill="url(#intervalGradient)" stroke="none" />
          <Line dataKey="calls" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-xs text-gray-400">
        Yellow dashed lines mark typical peak windows (9:30–10:00, 14:00–15:15)
      </p>
    </div>
  )
}
