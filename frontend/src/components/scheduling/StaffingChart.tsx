import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { WEEKDAYS } from '../../types'
import { minToTime } from '../../utils/scheduleEngine'

const WEEKDAY_COLORS = [
  '#6370fa', '#34d399', '#f87171', '#fbbf24',
  '#60a5fa', '#c084fc', '#fb923c',
]

interface Props {
  allSlots: number[]
  requiredPivot: Record<string, Record<string, number>>
  actualPivot?: Record<string, Record<string, number>>
  showActual: boolean
}

export default function StaffingChart({ allSlots, requiredPivot, actualPivot, showActual }: Props) {
  const [activeDay, setActiveDay] = useState<string>(WEEKDAYS[0])

  const chartData = allSlots.map((t) => {
    const lbl = minToTime(t)
    return {
      time: lbl,
      required: requiredPivot[activeDay]?.[lbl] ?? 0,
      actual: actualPivot?.[activeDay]?.[lbl] ?? 0,
    }
  })

  // Show only every 4th tick to avoid crowding
  const tickInterval = Math.max(1, Math.floor(allSlots.length / 12))

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Staffing Levels</h3>
          <p className="text-xs text-gray-500 mt-0.5">Required vs {showActual ? 'Actual (after roster)' : 'Calculated'}</p>
        </div>

        {/* Day tabs */}
        <div className="flex gap-1 flex-wrap">
          {WEEKDAYS.map((wd, i) => (
            <button
              key={wd}
              onClick={() => setActiveDay(wd)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                activeDay === wd
                  ? 'text-white border-transparent'
                  : 'text-gray-500 border-gray-200 hover:text-gray-700'
              }`}
              style={activeDay === wd ? { backgroundColor: WEEKDAY_COLORS[i] + '30', borderColor: WEEKDAY_COLORS[i] + '60', color: WEEKDAY_COLORS[i] } : {}}
            >
              {wd}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            interval={tickInterval}
            angle={-30}
            textAnchor="end"
            height={40}
          />
          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
          <Tooltip
            contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12 }}
            labelStyle={{ color: '#374151' }}
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="required"
            name="Required"
            stroke="#6370fa"
            strokeWidth={2}
            dot={false}
          />
          {showActual && (
            <Line
              type="monotone"
              dataKey="actual"
              name="Actual"
              stroke="#34d399"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
