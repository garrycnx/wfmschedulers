import { useState, useMemo } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { format, parseISO, isToday } from 'date-fns'
import { clsx } from 'clsx'
import type { HistoricalPoint, ModelResult } from '../../api/forecastApi'

interface ForecastChartProps {
  historical: HistoricalPoint[]
  modelResults: Record<string, ModelResult>
  selectedModel: string | null
  activeCI: '0.80' | '0.95'
}

const MODEL_COLORS: Record<string, string> = {
  prophet: '#6366f1',
  arima: '#f59e0b',
  ets: '#10b981',
  lstm: '#ef4444',
  ensemble: '#8b5cf6',
}

const HISTORICAL_COLOR = '#1e40af'

interface ChartDataPoint {
  date: string
  displayDate: string
  historical?: number
  [key: string]: number | string | undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[180px]">
      <p className="text-xs font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((entry: any) => {
        if (entry.value == null) return null
        return (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-xs text-gray-600 capitalize">
                {entry.name?.replace(/_/g, ' ')}
              </span>
            </div>
            <span className="text-xs font-semibold text-gray-800">
              {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomLegend = ({ payload, visibleModels, onToggle }: any) => {
  if (!payload) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
      {payload.map((entry: any) => {
        const key = entry.dataKey as string
        const isVisible = visibleModels.has(key) || key === 'historical'
        return (
          <button
            key={key}
            onClick={() => key !== 'historical' && onToggle(key)}
            className={clsx(
              'flex items-center gap-1.5 text-xs rounded-lg px-2 py-1 transition-all',
              key === 'historical' ? 'cursor-default' : 'cursor-pointer hover:bg-gray-100',
              !isVisible && 'opacity-40'
            )}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600 capitalize">{entry.value}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function ForecastChart({
  historical,
  modelResults,
  selectedModel,
  activeCI,
}: ForecastChartProps) {
  const modelKeys = Object.keys(modelResults)
  const [visibleModels, setVisibleModels] = useState<Set<string>>(new Set(modelKeys))
  const [showCI, setShowCI] = useState(true)

  const toggleModel = (model: string) => {
    setVisibleModels((prev) => {
      const next = new Set(prev)
      if (next.has(model)) {
        next.delete(model)
      } else {
        next.add(model)
      }
      return next
    })
  }

  // Find today's date string
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // Build merged chart data
  const chartData = useMemo<ChartDataPoint[]>(() => {
    const dateMap = new Map<string, ChartDataPoint>()

    // Add historical points
    for (const h of historical) {
      dateMap.set(h.date, {
        date: h.date,
        displayDate: format(parseISO(h.date), 'MMM d'),
        historical: h.value,
      })
    }

    // Add forecast points for each model
    for (const [modelKey, modelResult] of Object.entries(modelResults)) {
      for (const fp of modelResult.forecast) {
        const existing = dateMap.get(fp.date) ?? {
          date: fp.date,
          displayDate: format(parseISO(fp.date), 'MMM d'),
        }
        existing[modelKey] = fp.value
        if (modelKey === selectedModel) {
          if (fp.ci_lower_80 != null) existing['ci_lower_80'] = fp.ci_lower_80
          if (fp.ci_upper_80 != null) existing['ci_upper_80'] = fp.ci_upper_80
          if (fp.ci_lower_95 != null) existing['ci_lower_95'] = fp.ci_lower_95
          if (fp.ci_upper_95 != null) existing['ci_upper_95'] = fp.ci_upper_95
        }
        dateMap.set(fp.date, existing)
      }
    }

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [historical, modelResults, selectedModel])

  // Tick formatter — show every 7th label
  const tickFormatter = (value: string, index: number) => {
    if (index % 7 === 0) return value
    return ''
  }

  const yDomain = useMemo(() => {
    const allValues = chartData.flatMap((d) =>
      Object.entries(d)
        .filter(([k]) => !['date', 'displayDate'].includes(k))
        .map(([, v]) => (typeof v === 'number' ? v : null))
        .filter((v): v is number => v !== null)
    )
    if (!allValues.length) return [0, 'auto'] as [number, string]
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    const pad = (max - min) * 0.1
    return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)] as [number, number]
  }, [chartData])

  const selectedColor = selectedModel ? (MODEL_COLORS[selectedModel] ?? '#6366f1') : '#6366f1'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Call Volume Forecast</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Historical actuals + model forecasts with confidence intervals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCI(!showCI)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              showCI
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            )}
          >
            {showCI ? 'Hide CI' : 'Show CI'}
          </button>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
            CI: {activeCI === '0.80' ? '80%' : '80% & 95%'}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <defs>
            <linearGradient id="historicalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={HISTORICAL_COLOR} stopOpacity={0.3} />
              <stop offset="95%" stopColor={HISTORICAL_COLOR} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="ci95Gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={selectedColor} stopOpacity={0.15} />
              <stop offset="95%" stopColor={selectedColor} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="ci80Gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={selectedColor} stopOpacity={0.25} />
              <stop offset="95%" stopColor={selectedColor} stopOpacity={0.08} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />

          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFormatter}
            interval={0}
          />

          <YAxis
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
            domain={yDomain}
            width={50}
          />

          <Tooltip content={<CustomTooltip />} />

          <Legend
            content={
              <CustomLegend
                visibleModels={visibleModels}
                onToggle={toggleModel}
              />
            }
          />

          {/* Today reference line */}
          {chartData.some((d) => d.date === todayStr) && (
            <ReferenceLine
              x={format(new Date(), 'MMM d')}
              stroke="#374151"
              strokeDasharray="4 2"
              strokeWidth={1.5}
              label={{
                value: 'Today',
                position: 'top',
                fill: '#374151',
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          )}

          {/* 95% CI shaded area */}
          {showCI && selectedModel && activeCI === '0.95' && (
            <Area
              dataKey="ci_upper_95"
              stroke="none"
              fill={selectedColor}
              fillOpacity={0.08}
              legendType="none"
              name="CI 95% Upper"
              connectNulls
            />
          )}
          {showCI && selectedModel && activeCI === '0.95' && (
            <Area
              dataKey="ci_lower_95"
              stroke="none"
              fill="white"
              fillOpacity={1}
              legendType="none"
              name="CI 95% Lower"
              connectNulls
            />
          )}

          {/* 80% CI shaded area */}
          {showCI && selectedModel && (
            <Area
              dataKey="ci_upper_80"
              stroke="none"
              fill={selectedColor}
              fillOpacity={0.15}
              legendType="none"
              name="CI 80% Upper"
              connectNulls
            />
          )}
          {showCI && selectedModel && (
            <Area
              dataKey="ci_lower_80"
              stroke="none"
              fill="white"
              fillOpacity={1}
              legendType="none"
              name="CI 80% Lower"
              connectNulls
            />
          )}

          {/* Historical area */}
          <Area
            dataKey="historical"
            name="Historical"
            stroke={HISTORICAL_COLOR}
            strokeWidth={2}
            fill="url(#historicalGradient)"
            dot={false}
            activeDot={{ r: 4, fill: HISTORICAL_COLOR }}
            connectNulls
          />

          {/* Model forecast lines */}
          {modelKeys.map((modelKey) => {
            const modelResult = modelResults[modelKey]
            const color = MODEL_COLORS[modelKey] ?? '#6366f1'
            const isSelected = modelKey === selectedModel
            const isVisible = visibleModels.has(modelKey)
            if (!isVisible) return null
            return (
              <Line
                key={modelKey}
                dataKey={modelKey}
                name={modelResult.model_display_name}
                stroke={color}
                strokeWidth={isSelected ? 2.5 : 1.5}
                strokeDasharray={isSelected ? undefined : '5 3'}
                dot={false}
                activeDot={{ r: 4, fill: color }}
                connectNulls
                opacity={isSelected ? 1 : 0.7}
              />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Model quick-toggle strip */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">Toggle:</span>
          {modelKeys.map((modelKey) => {
            const modelResult = modelResults[modelKey]
            const color = MODEL_COLORS[modelKey] ?? '#6366f1'
            const isVisible = visibleModels.has(modelKey)
            return (
              <button
                key={modelKey}
                onClick={() => toggleModel(modelKey)}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                  isVisible
                    ? 'border-transparent text-white'
                    : 'border-gray-200 text-gray-400 bg-white'
                )}
                style={isVisible ? { backgroundColor: color } : {}}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: isVisible ? 'rgba(255,255,255,0.7)' : color }}
                />
                {modelResult.model_display_name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
