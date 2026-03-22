import { TrendingUp, Star, AlertTriangle, Info, Calendar, BarChart2, Clock, Zap } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { clsx } from 'clsx'
import type { InsightItem, SeasonalityPattern, ForecastResponse } from '../../api/forecastApi'

interface InsightsPanelProps {
  insights: InsightItem[]
  seasonality: SeasonalityPattern[]
  result: ForecastResponse
}

const SEVERITY_STYLES: Record<string, { border: string; bg: string; iconBg: string; iconColor: string; titleColor: string }> = {
  success: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    titleColor: 'text-emerald-800',
  },
  warning: {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-800',
  },
  info: {
    border: 'border-blue-200',
    bg: 'bg-blue-50',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-800',
  },
}

function getInsightIcon(type: string, severity: string) {
  const cls = clsx('w-4 h-4', SEVERITY_STYLES[severity]?.iconColor ?? 'text-gray-500')
  switch (type) {
    case 'trend':
    case 'growth':
      return <TrendingUp className={cls} />
    case 'recommendation':
    case 'model':
      return <Star className={cls} />
    case 'warning':
    case 'anomaly':
      return <AlertTriangle className={cls} />
    default:
      return <Info className={cls} />
  }
}

function SeasonalityBar({ strength, color }: { strength: number; color: string }) {
  return (
    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, strength * 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

const SEASONALITY_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6']

export default function InsightsPanel({ insights, seasonality, result }: InsightsPanelProps) {
  const bestModel = result.model_results[result.best_model]

  const totalForecastVolume = Object.values(result.model_results).reduce((sum, mr) => {
    if (mr.model_name !== result.best_model) return sum
    return mr.forecast.reduce((s, fp) => s + fp.value, 0)
  }, 0)

  const formattedGenAt = (() => {
    try {
      return format(parseISO(result.generated_at), 'MMM d, yyyy h:mm a')
    } catch {
      return result.generated_at
    }
  })()

  // Group insights by severity
  const warnings = insights.filter((i) => i.severity === 'warning')
  const successes = insights.filter((i) => i.severity === 'success')
  const infos = insights.filter((i) => i.severity === 'info')
  const ordered = [...warnings, ...successes, ...infos]

  return (
    <div className="space-y-5">
      {/* Key Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-medium text-gray-500">Forecast Period</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{result.horizon} days</p>
          <p className="text-[11px] text-gray-400 mt-0.5">from today</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-medium text-gray-500">Total Calls</span>
          </div>
          <p className="text-xl font-bold text-gray-900">
            {totalForecastVolume > 0
              ? totalForecastVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })
              : '—'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">forecasted volume</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-medium text-gray-500">Best Model</span>
          </div>
          <p className="text-base font-bold text-gray-900 leading-tight">
            {bestModel?.model_display_name ?? result.best_model}
          </p>
          {bestModel && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              MAPE: {bestModel.metrics.mape.toFixed(2)}%
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-gray-500">Generated At</span>
          </div>
          <p className="text-sm font-bold text-gray-900 leading-snug">{formattedGenAt}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Job: {result.job_id.slice(0, 8)}…</p>
        </div>
      </div>

      {/* Insights Cards */}
      {ordered.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">AI Insights</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {insights.length} insight{insights.length !== 1 ? 's' : ''} generated from your forecast
            </p>
          </div>

          <div className="p-5 grid gap-3 sm:grid-cols-2">
            {ordered.map((insight, idx) => {
              const style = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.info
              return (
                <div
                  key={idx}
                  className={clsx(
                    'flex gap-3 p-4 rounded-xl border',
                    style.border,
                    style.bg
                  )}
                >
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', style.iconBg)}>
                    {getInsightIcon(insight.type, insight.severity)}
                  </div>
                  <div>
                    <p className={clsx('text-sm font-semibold', style.titleColor)}>{insight.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{insight.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Seasonality Patterns */}
      {seasonality.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Seasonality Patterns</h3>
            <p className="text-xs text-gray-500 mt-0.5">Detected cyclical patterns in your call volume data</p>
          </div>

          <div className="p-5 space-y-4">
            {seasonality.map((pattern, idx) => {
              const color = SEASONALITY_COLORS[idx % SEASONALITY_COLORS.length]
              const strengthPct = Math.round(pattern.strength * 100)

              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-sm font-semibold text-gray-800 capitalize">{pattern.period}</span>
                      <span className="text-xs text-gray-400">— peak: {pattern.peak_day_or_month}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-bold"
                        style={{ color }}
                      >
                        {strengthPct}%
                      </span>
                      <span className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                        strengthPct >= 70 ? 'bg-red-100 text-red-600' :
                        strengthPct >= 40 ? 'bg-amber-100 text-amber-600' :
                        'bg-gray-100 text-gray-500'
                      )}>
                        {strengthPct >= 70 ? 'Strong' : strengthPct >= 40 ? 'Moderate' : 'Weak'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <SeasonalityBar strength={pattern.strength} color={color} />
                  </div>

                  <p className="text-xs text-gray-500 leading-relaxed pl-4">{pattern.description}</p>
                </div>
              )
            })}
          </div>

          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Seasonality strength is relative to baseline variability. Strong patterns (70%+) should be accounted for in staffing decisions.
            </p>
          </div>
        </div>
      )}

      {/* Model Details */}
      {bestModel && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Recommended Model Details</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {bestModel.model_display_name} — selected as best performing model
            </p>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">MAPE</p>
              <p className="text-lg font-bold text-gray-900">{bestModel.metrics.mape.toFixed(2)}%</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">RMSE</p>
              <p className="text-lg font-bold text-gray-900">{bestModel.metrics.rmse.toFixed(1)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">MAE</p>
              <p className="text-lg font-bold text-gray-900">{bestModel.metrics.mae.toFixed(1)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Score</p>
              <p className="text-lg font-bold text-indigo-700">{bestModel.recommendation_score.toFixed(0)}/100</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Train Time</p>
              <p className="text-lg font-bold text-gray-900">
                {bestModel.training_time_seconds < 60
                  ? `${bestModel.training_time_seconds.toFixed(1)}s`
                  : `${(bestModel.training_time_seconds / 60).toFixed(1)}m`}
              </p>
            </div>
            {bestModel.metrics.aic != null && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">AIC</p>
                <p className="text-lg font-bold text-gray-900">{bestModel.metrics.aic.toFixed(0)}</p>
              </div>
            )}
          </div>
          <div className="px-5 pb-4">
            <p className="text-xs text-gray-500 leading-relaxed">{bestModel.description}</p>
          </div>
        </div>
      )}
    </div>
  )
}
