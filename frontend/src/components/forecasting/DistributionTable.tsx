import { useMemo } from 'react'
import { Download } from 'lucide-react'
import { clsx } from 'clsx'
import Papa from 'papaparse'
import type { DistributionRow } from '../../api/forecastApi'

interface DistributionTableProps {
  distribution: DistributionRow[]
  horizon: number
  jobId: string
}

const INTERVAL_BADGE: Record<string, { label: string; classes: string }> = {
  daily:   { label: 'Daily',   classes: 'bg-blue-100 text-blue-700' },
  weekly:  { label: 'Weekly',  classes: 'bg-emerald-100 text-emerald-700' },
  monthly: { label: 'Monthly', classes: 'bg-purple-100 text-purple-700' },
}

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  normal:   { label: 'Normal',   classes: 'bg-gray-100 text-gray-600' },
  high:     { label: 'High',     classes: 'bg-amber-100 text-amber-700' },
  peak:     { label: 'Peak',     classes: 'bg-red-100 text-red-700' },
  low:      { label: 'Low',      classes: 'bg-sky-100 text-sky-700' },
  holiday:  { label: 'Holiday',  classes: 'bg-pink-100 text-pink-700' },
}

function AllocationBar({ pct }: { pct: number }) {
  const width = Math.min(100, Math.max(0, pct))
  const color =
    pct > 20 ? 'bg-red-400' :
    pct > 10 ? 'bg-amber-400' :
    'bg-emerald-400'
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-600 w-10 text-right tabular-nums">
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

export default function DistributionTable({ distribution, horizon, jobId }: DistributionTableProps) {
  const totalForecast = useMemo(
    () => distribution.reduce((sum, r) => sum + r.forecast_total, 0),
    [distribution]
  )

  const handleExportCSV = () => {
    const csvData = distribution.map((r) => ({
      'Date Range': r.date_range,
      'Forecast Total': r.forecast_total,
      'Interval Type': r.interval_type,
      'Allocation %': r.allocation_pct.toFixed(2),
      Status: r.status,
    }))

    const csv = Papa.unparse(csvData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `forecast-distribution-${jobId}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Volume Distribution</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {horizon}-day forecast broken down by period — {distribution.length} intervals
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-5 py-3">
          <p className="text-xs text-gray-500">Total Forecasted</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">
            {totalForecast.toLocaleString()}
          </p>
          <p className="text-[11px] text-gray-400">calls over {horizon} days</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-xs text-gray-500">Avg per Day</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">
            {Math.round(totalForecast / horizon).toLocaleString()}
          </p>
          <p className="text-[11px] text-gray-400">calls / day</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-xs text-gray-500">Intervals</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">
            {distribution.length}
          </p>
          <p className="text-[11px] text-gray-400">periods tracked</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Date Range
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Forecast Total
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Interval
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Allocation %
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {distribution.map((row, idx) => {
              const intervalBadge = INTERVAL_BADGE[row.interval_type.toLowerCase()] ?? {
                label: row.interval_type,
                classes: 'bg-gray-100 text-gray-600',
              }
              const statusBadge = STATUS_BADGE[row.status.toLowerCase()] ?? {
                label: row.status,
                classes: 'bg-gray-100 text-gray-600',
              }

              return (
                <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                  {/* Date Range */}
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-800">{row.date_range}</span>
                  </td>

                  {/* Forecast Total */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-gray-900 tabular-nums">
                      {row.forecast_total.toLocaleString()}
                    </span>
                  </td>

                  {/* Interval Type */}
                  <td className="px-4 py-3 text-center">
                    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', intervalBadge.classes)}>
                      {intervalBadge.label}
                    </span>
                  </td>

                  {/* Allocation Bar */}
                  <td className="px-4 py-3">
                    <AllocationBar pct={row.allocation_pct} />
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', statusBadge.classes)}>
                      {statusBadge.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>

          {/* Summary Row */}
          <tfoot>
            <tr className="bg-indigo-50 border-t-2 border-indigo-100">
              <td className="px-4 py-3 text-sm font-semibold text-indigo-800">
                Total
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-bold text-indigo-900 tabular-nums">
                  {totalForecast.toLocaleString()}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <span className="text-xs text-indigo-600 font-medium">{distribution.length} intervals</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-indigo-200 rounded-full">
                    <div className="h-full w-full bg-indigo-500 rounded-full" />
                  </div>
                  <span className="text-xs font-semibold text-indigo-700 w-10 text-right">100%</span>
                </div>
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          Allocation % represents each period's share of the total forecast volume. Use this to size staffing per period.
        </p>
      </div>
    </div>
  )
}
