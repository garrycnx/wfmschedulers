import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  ReferenceLine,
} from 'recharts'
import type { ModelResult } from '../../api/forecastApi'

interface AccuracyChartProps {
  modelResults: Record<string, ModelResult>
}

const MODEL_COLORS: Record<string, string> = {
  prophet: '#6366f1',
  arima: '#f59e0b',
  ets: '#10b981',
  lstm: '#ef4444',
  ensemble: '#8b5cf6',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null
  const d = payload[0]
  const mape = d.value as number
  const quality =
    mape < 5 ? { label: 'Excellent', color: '#10b981' } :
    mape < 10 ? { label: 'Good', color: '#f59e0b' } :
    { label: 'Needs Improvement', color: '#ef4444' }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[160px]">
      <p className="text-xs font-semibold text-gray-800 mb-1">{d.payload.name}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-gray-500">MAPE</span>
        <span className="text-sm font-bold" style={{ color: d.fill }}>{mape.toFixed(2)}%</span>
      </div>
      <div className="flex items-center justify-between gap-3 mt-1">
        <span className="text-xs text-gray-500">Quality</span>
        <span className="text-xs font-semibold" style={{ color: quality.color }}>{quality.label}</span>
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomLabel = (props: any) => {
  const { x, y, width, value } = props
  return (
    <text
      x={x + width / 2}
      y={y - 5}
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
      fill="#374151"
    >
      {(value as number).toFixed(1)}%
    </text>
  )
}

export default function AccuracyChart({ modelResults }: AccuracyChartProps) {
  const data = Object.entries(modelResults)
    .map(([key, result]) => ({
      key,
      name: result.model_display_name,
      mape: result.metrics.mape,
      color: MODEL_COLORS[key] ?? '#6366f1',
    }))
    .sort((a, b) => a.mape - b.mape)

  const maxMape = Math.max(...data.map((d) => d.mape), 15)
  const yMax = Math.ceil(maxMape * 1.2)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Model Accuracy Comparison (MAPE %)</h3>
            <p className="text-xs text-gray-500 mt-0.5">Mean Absolute Percentage Error — lower is better</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-gray-500">&lt;5% Excellent</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-gray-500">5–10% Good</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-gray-500">&gt;10% Poor</span>
            </div>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
          margin={{ top: 25, right: 20, left: 10, bottom: 10 }}
          barCategoryGap="35%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />

          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
          />

          <YAxis
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
            domain={[0, yMax]}
            width={40}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)' }} />

          {/* Reference lines for quality thresholds */}
          <ReferenceLine
            y={5}
            stroke="#10b981"
            strokeDasharray="4 2"
            strokeWidth={1.5}
            label={{
              value: '5% target',
              position: 'right',
              fill: '#10b981',
              fontSize: 10,
              fontWeight: 600,
            }}
          />
          <ReferenceLine
            y={10}
            stroke="#f59e0b"
            strokeDasharray="4 2"
            strokeWidth={1.5}
            label={{
              value: '10% threshold',
              position: 'right',
              fill: '#f59e0b',
              fontSize: 10,
              fontWeight: 600,
            }}
          />

          <Bar dataKey="mape" radius={[6, 6, 0, 0]} maxBarSize={60}>
            <LabelList content={<CustomLabel />} />
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.color} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* "Lower is better" note */}
      <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-gray-400">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
        </svg>
        Lower MAPE indicates better forecast accuracy
      </div>
    </div>
  )
}
