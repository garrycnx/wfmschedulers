import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, Archive, Download, Trash2, CalendarDays, Users, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { useScheduleStore } from '../store/scheduleStore'

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const statusStyle: Record<string, string> = {
  released: 'badge-green',
  archived: 'badge-slate',
}

export default function ScheduleHistory() {
  const navigate = useNavigate()
  const { releaseHistory, archiveHistoryEntry, deleteHistoryEntry } = useScheduleStore()
  const [search, setSearch] = useState('')

  const filtered = releaseHistory.filter((e) => {
    const rangeStr = `${fmtDate(e.range.from)} – ${fmtDate(e.range.to)}`
    return rangeStr.toLowerCase().includes(search.toLowerCase())
  })

  function handleExport(id: string) {
    const entry = releaseHistory.find((e) => e.id === id)
    if (!entry) return
    const data = JSON.stringify(entry, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schedule-${entry.range.from}-to-${entry.range.to}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Schedule exported.')
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by date range…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => navigate('/generate')}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold
                     rounded-xl px-4 py-2.5 text-sm transition-all shadow-glow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Schedule
        </button>
      </div>

      {/* Schedule cards */}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {filtered.map((entry, i) => {
            const proj = entry.projections.find((p) => p.day === 'TOTAL') ?? entry.projections[0]
            const rangeLabel = `${fmtDate(entry.range.from)} – ${fmtDate(entry.range.to)}`

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <CalendarDays className="w-4 h-4 text-brand-500 shrink-0" />
                        {rangeLabel}
                      </h3>
                      <span className={statusStyle[entry.status]}>{entry.status}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      <span className="text-xs text-gray-400">
                        Released {fmtDateTime(entry.releasedAt)}
                      </span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Users className="w-3.5 h-3.5" />
                        {entry.agentCount} agents
                      </span>
                    </div>
                  </div>

                  {/* KPIs – only if projections exist */}
                  {proj && (
                    <div className="flex items-center gap-4 text-sm shrink-0">
                      <div className="text-center">
                        <p className={`font-bold text-base ${proj.projectedSLAPct >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {proj.projectedSLAPct.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-gray-400">SLA</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-base text-gray-700">{proj.avgOccupancyPct.toFixed(1)}%</p>
                        <p className="text-[10px] text-gray-400">Occ.</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-base text-gray-700">
                          {proj.totalCalls.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-400">Calls</p>
                      </div>
                    </div>
                  )}

                  {!proj && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
                      <TrendingUp className="w-4 h-4" />
                      No projections
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleExport(entry.id)}
                      className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                      title="Export JSON"
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    {entry.status !== 'archived' && (
                      <button
                        onClick={() => {
                          archiveHistoryEntry(entry.id)
                          toast.success('Schedule archived.')
                        }}
                        className="p-2 rounded-xl text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-all"
                        title="Archive"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => {
                        deleteHistoryEntry(entry.id)
                        toast.success('Entry removed from history.')
                      }}
                      className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white border border-gray-200 rounded-2xl p-14 text-center"
          >
            <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm font-medium">
              {search ? 'No schedules match your search.' : 'No schedules have been released yet.'}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Generate and release a schedule to see it here.
            </p>
            <button
              onClick={() => navigate('/generate')}
              className="mt-5 text-brand-600 hover:text-brand-500 text-sm font-semibold transition-colors"
            >
              Generate your first schedule →
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
