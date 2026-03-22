import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Award, Check } from 'lucide-react'
import { clsx } from 'clsx'
import type { ModelResult } from '../../api/forecastApi'

interface ModelComparisonTableProps {
  modelResults: Record<string, ModelResult>
  selectedModel: string | null
  onSelect: (model: string) => void
  bestModel: string
}

type SortKey = 'model_display_name' | 'mape' | 'rmse' | 'mae' | 'aic' | 'recommendation_score' | 'training_time_seconds'
type SortDir = 'asc' | 'desc'

const MODEL_COLORS: Record<string, string> = {
  prophet: '#6366f1',
  arima: '#f59e0b',
  ets: '#10b981',
  lstm: '#ef4444',
  ensemble: '#8b5cf6',
}

function MapeCell({ value }: { value: number }) {
  const color =
    value < 5 ? 'text-emerald-700 bg-emerald-50' :
    value < 10 ? 'text-amber-700 bg-amber-50' :
    'text-red-700 bg-red-50'
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', color)}>
      {value.toFixed(2)}%
    </span>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-emerald-500' :
    score >= 60 ? 'bg-amber-500' :
    'bg-red-500'
  const textColor =
    score >= 80 ? 'text-emerald-700' :
    score >= 60 ? 'text-amber-700' :
    'text-red-700'
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
      <span className={clsx('text-xs font-semibold w-8 text-right', textColor)}>
        {score.toFixed(0)}
      </span>
    </div>
  )
}

function SortIcon({ column, sortKey, sortDir }: { column: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (column !== sortKey) return <ChevronsUpDown className="w-3 h-3 text-gray-300" />
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-indigo-600" />
    : <ChevronDown className="w-3 h-3 text-indigo-600" />
}

export default function ModelComparisonTable({
  modelResults,
  selectedModel,
  onSelect,
  bestModel,
}: ModelComparisonTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('recommendation_score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'model_display_name' ? 'asc' : 'desc')
    }
  }

  const rows = useMemo(() => {
    return Object.entries(modelResults)
      .map(([key, result]) => ({ key, ...result }))
      .sort((a, b) => {
        let aVal: number | string
        let bVal: number | string

        switch (sortKey) {
          case 'model_display_name':
            aVal = a.model_display_name
            bVal = b.model_display_name
            break
          case 'mape':
            aVal = a.metrics.mape
            bVal = b.metrics.mape
            break
          case 'rmse':
            aVal = a.metrics.rmse
            bVal = b.metrics.rmse
            break
          case 'mae':
            aVal = a.metrics.mae
            bVal = b.metrics.mae
            break
          case 'aic':
            aVal = a.metrics.aic ?? Infinity
            bVal = b.metrics.aic ?? Infinity
            break
          case 'recommendation_score':
            aVal = a.recommendation_score
            bVal = b.recommendation_score
            break
          case 'training_time_seconds':
            aVal = a.training_time_seconds
            bVal = b.training_time_seconds
            break
          default:
            return 0
        }

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
        }
        return sortDir === 'asc'
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number)
      })
  }, [modelResults, sortKey, sortDir])

  const lowestMapeKey = useMemo(() => {
    let best = ''
    let bestMape = Infinity
    for (const [key, r] of Object.entries(modelResults)) {
      if (r.metrics.mape < bestMape) {
        bestMape = r.metrics.mape
        best = key
      }
    }
    return best
  }, [modelResults])

  const headers: Array<{ key: SortKey; label: string; align?: string }> = [
    { key: 'model_display_name', label: 'Model' },
    { key: 'mape', label: 'MAPE', align: 'center' },
    { key: 'rmse', label: 'RMSE', align: 'right' },
    { key: 'mae', label: 'MAE', align: 'right' },
    { key: 'aic', label: 'AIC', align: 'right' },
    { key: 'recommendation_score', label: 'Score' },
    { key: 'training_time_seconds', label: 'Train Time', align: 'right' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">Model Performance Comparison</h3>
        <p className="text-xs text-gray-500 mt-0.5">Click any row or column header to sort. Lower MAPE = better accuracy.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {headers.map((h) => (
                <th
                  key={h.key}
                  onClick={() => handleSort(h.key)}
                  className={clsx(
                    'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap',
                    h.align === 'center' && 'text-center',
                    h.align === 'right' && 'text-right'
                  )}
                >
                  <div className={clsx('flex items-center gap-1', h.align === 'center' && 'justify-center', h.align === 'right' && 'justify-end')}>
                    {h.label}
                    <SortIcon column={h.key} sortKey={sortKey} sortDir={sortDir} />
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Select
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => {
              const isSelected = selectedModel === row.key
              const isBest = row.key === lowestMapeKey
              const dotColor = MODEL_COLORS[row.key] ?? '#6366f1'

              return (
                <tr
                  key={row.key}
                  onClick={() => onSelect(row.key)}
                  className={clsx(
                    'cursor-pointer transition-colors group',
                    isSelected
                      ? 'bg-indigo-50 hover:bg-indigo-100'
                      : 'hover:bg-gray-50'
                  )}
                >
                  {/* Model Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: dotColor }}
                      />
                      <span className={clsx('font-medium', isSelected ? 'text-indigo-800' : 'text-gray-800')}>
                        {row.model_display_name}
                      </span>
                      {isBest && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                          <Award className="w-2.5 h-2.5" />
                          Best
                        </span>
                      )}
                      {row.key === bestModel && row.key !== lowestMapeKey && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-semibold">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 pl-5 line-clamp-1">{row.description}</p>
                  </td>

                  {/* MAPE */}
                  <td className="px-4 py-3 text-center">
                    <MapeCell value={row.metrics.mape} />
                  </td>

                  {/* RMSE */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-mono text-gray-700">
                      {row.metrics.rmse.toFixed(1)}
                    </span>
                  </td>

                  {/* MAE */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-mono text-gray-700">
                      {row.metrics.mae.toFixed(1)}
                    </span>
                  </td>

                  {/* AIC */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-mono text-gray-500">
                      {row.metrics.aic != null ? row.metrics.aic.toFixed(0) : '—'}
                    </span>
                  </td>

                  {/* Score */}
                  <td className="px-4 py-3">
                    <ScoreBar score={row.recommendation_score} />
                  </td>

                  {/* Training Time */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-mono text-gray-500">
                      {row.training_time_seconds < 60
                        ? `${row.training_time_seconds.toFixed(1)}s`
                        : `${(row.training_time_seconds / 60).toFixed(1)}m`}
                    </span>
                  </td>

                  {/* Select Button */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelect(row.key) }}
                      className={clsx(
                        'inline-flex items-center justify-center w-7 h-7 rounded-full border transition-all',
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-gray-200 text-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                      )}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          MAPE = Mean Absolute Percentage Error. RMSE = Root Mean Square Error. MAE = Mean Absolute Error. AIC = Akaike Information Criterion (lower is better).
        </p>
      </div>
    </div>
  )
}
