import { useMemo } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { clsx } from 'clsx'
import type { DayProjection, RosterRow, BreakRow, ForecastRow, StaffingRow } from '../../types'
import { WEEKDAYS } from '../../types'
import toast from 'react-hot-toast'

interface Props {
  projections: DayProjection[]
  rosterRows: RosterRow[]
  breakRows: BreakRow[]
  forecastRows: ForecastRow[]
  requiredStaff: StaffingRow[]
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => {
        const val = String(r[h] ?? '')
        return val.includes(',') ? `"${val}"` : val
      }).join(','),
    ),
  ]
  return lines.join('\n')
}

function downloadCsv(data: string, filename: string) {
  const blob = new Blob([data], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ProjectionsTable({ projections, rosterRows, breakRows, forecastRows, requiredStaff }: Props) {
  // Build TOTAL row
  const rows = useMemo(() => {
    const wdRows = projections.filter((r) => r.day !== 'TOTAL')
    const totalCalls = wdRows.reduce((s, r) => s + r.totalCalls, 0)
    const totalSLA = totalCalls > 0
      ? wdRows.reduce((s, r) => s + r.projectedSLAPct * r.totalCalls, 0) / totalCalls
      : 0
    const totalAbandon = totalCalls > 0
      ? wdRows.reduce((s, r) => s + r.projectedAbandonPct * r.totalCalls, 0) / totalCalls
      : 0
    const totalOcc = totalCalls > 0
      ? wdRows.reduce((s, r) => s + r.avgOccupancyPct * r.totalCalls, 0) / totalCalls
      : 0
    const totalInflex = wdRows.reduce((s, r) => s + r.schedulingInflexPct, 0) / Math.max(wdRows.length, 1)

    const total: DayProjection = {
      day: 'TOTAL',
      totalCalls,
      projectedSLAPct: +totalSLA.toFixed(2),
      projectedAbandonPct: +totalAbandon.toFixed(2),
      avgOccupancyPct: +totalOcc.toFixed(2),
      schedulingInflexPct: +totalInflex.toFixed(2),
    }
    return [...wdRows, total]
  }, [projections])

  function handleExport(type: 'roster' | 'breaks' | 'projections') {
    const map = {
      roster: { data: rosterRows, name: 'roster.csv' },
      breaks: { data: breakRows, name: 'breaks.csv' },
      projections: {
        data: rows.map((r) => ({
          Day: r.day,
          'Total Calls': r.totalCalls,
          'Projected SLA %': r.projectedSLAPct,
          'Projected Abandon %': r.projectedAbandonPct,
          'Avg Occupancy %': r.avgOccupancyPct,
          'Scheduling Inflex %': r.schedulingInflexPct,
        })),
        name: 'projections.csv',
      },
    }
    const { data, name } = map[type]
    downloadCsv(toCsv(data as Record<string, unknown>[]), name)
    toast.success(`${name} downloaded.`)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Projections table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Daily Projections</h3>
            <p className="text-xs text-gray-500 mt-0.5">Erlang-A estimates after roster optimisation</p>
          </div>
        </div>

        <table className="wfm-table w-full">
          <thead>
            <tr>
              <th className="text-left">Day</th>
              <th className="text-right">Total Calls</th>
              <th className="text-right">Proj. SLA %</th>
              <th className="text-right">Proj. Abandon %</th>
              <th className="text-right">Avg Occupancy %</th>
              <th className="text-right">Sched. Inflex %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.day} className={r.day === 'TOTAL' ? 'font-bold' : ''}>
                <td className={r.day === 'TOTAL' ? 'text-gray-900 font-bold' : ''}>{r.day}</td>
                <td className="text-right font-mono">{r.totalCalls.toLocaleString()}</td>
                <td className={clsx('text-right font-mono font-semibold',
                  r.projectedSLAPct >= 80 ? 'text-emerald-600' : 'text-amber-600')}>
                  {r.projectedSLAPct}%
                </td>
                <td className={clsx('text-right font-mono',
                  r.projectedAbandonPct <= 5 ? 'text-emerald-600' : 'text-red-500')}>
                  {r.projectedAbandonPct}%
                </td>
                <td className="text-right font-mono text-gray-700">{r.avgOccupancyPct}%</td>
                <td className={clsx('text-right font-mono',
                  r.schedulingInflexPct >= 0 ? 'text-sky-600' : 'text-amber-600')}>
                  {r.schedulingInflexPct >= 0 ? '+' : ''}{r.schedulingInflexPct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Export section */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Export Results</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Roster CSV',      icon: FileSpreadsheet, type: 'roster' as const,      desc: `${rosterRows.length} agents` },
            { label: 'Breaks CSV',      icon: FileSpreadsheet, type: 'breaks' as const,      desc: `${breakRows.length} agents` },
            { label: 'Projections CSV', icon: FileSpreadsheet, type: 'projections' as const, desc: '7 days + total' },
          ].map((ex) => (
            <button
              key={ex.type}
              onClick={() => handleExport(ex.type)}
              className="flex items-center gap-3 bg-gray-50 border border-gray-200 hover:border-brand-400
                         hover:bg-brand-50 rounded-xl p-4 text-left transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                <ex.icon className="w-5 h-5 text-brand-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-gray-900">{ex.label}</p>
                <p className="text-xs text-gray-500">{ex.desc}</p>
              </div>
              <Download className="w-4 h-4 text-gray-300 group-hover:text-brand-500 ml-auto transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
