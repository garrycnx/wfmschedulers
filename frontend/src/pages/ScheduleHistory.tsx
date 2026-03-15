import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, Archive, Download, Trash2, CalendarDays, Users, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { useScheduleStore } from '../store/scheduleStore'
import { schedulesApi } from '../api/client'
import type { DayProjection } from '../types'

// ─── Unified display shape ────────────────────────────────────────────────────
interface DisplayEntry {
  id: string
  releasedAt: string
  range: { from: string; to: string }
  agentCount: number
  projections: DayProjection[]
  status: 'released' | 'archived'
  source: 'backend' | 'local'
}

// ─── Map the backend Schedule shape → DisplayEntry ────────────────────────────
function fromBackend(s: {
  id: string
  name: string
  weekStartDate: string
  status: string
  createdAt: string
  settingsJson?: string
  agentsJson?: string
  projectionsJson?: string
}): DisplayEntry {
  let from = (s.weekStartDate ?? '').split('T')[0]
  let to = from
  let agentCount = 0
  const projections: DayProjection[] = []

  try {
    const settings = JSON.parse(s.settingsJson ?? '{}')
    if (settings.releaseFrom) from = settings.releaseFrom
    if (settings.releaseTo) to = settings.releaseTo
  } catch { /* ignore */ }

  try {
    const agents = JSON.parse(s.agentsJson ?? '[]')
    agentCount = Array.isArray(agents) ? agents.length : 0
  } catch { /* ignore */ }

  try {
    const parsed = JSON.parse(s.projectionsJson ?? '[]')
    if (Array.isArray(parsed)) projections.push(...parsed)
  } catch { /* ignore */ }

  return {
    id: s.id,
    releasedAt: s.createdAt,
    range: { from, to },
    agentCount,
    projections,
    status: s.status === 'archived' ? 'archived' : 'released',
    source: 'backend',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  if (!iso) return '—'
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

// ─── Component ────────────────────────────────────────────────────────────────
export default function ScheduleHistory() {
  const navigate = useNavigate()
  const { releaseHistory, archiveHistoryEntry, deleteHistoryEntry } = useScheduleStore()
  const [search, setSearch] = useState('')

  // Try to fetch from backend (silent – falls back to localStorage if unavailable)
  const { data: backendSchedules } = useQuery({
    queryKey: ['schedules'],
    queryFn: () =>
      schedulesApi.list().then((r) =>
        (r.data as Parameters<typeof fromBackend>[0][]).map(fromBackend),
      ),
    staleTime: 30_000,
    // Don't surface network errors to the user
    retry: 1,
  })

  // Convert localStorage entries to the same shape for the fallback
  const localEntries: DisplayEntry[] = releaseHistory.map((e) => ({
    ...e,
    source: 'local' as const,
  }))

  // Prefer backend data; fall back to localStorage if backend has nothing yet
  const allEntries: DisplayEntry[] =
    backendSchedules && backendSchedules.length > 0 ? backendSchedules : localEntries

  const filtered = allEntries.filter((e) => {
    const rangeStr = `${fmtDate(e.range.from)} – ${fmtDate(e.range.to)}`
    return rangeStr.toLowerCase().includes(search.toLowerCase())
  })

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleExport(entry: DisplayEntry) {
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

  async function handleArchive(entry: DisplayEntry) {
    if (entry.source === 'backend') {
      try {
        await schedulesApi.archive(entry.id)
        toast.success('Schedule archived.')
      } catch {
        toast.error('Failed to archive. Please try again.')
      }
    } else {
      archiveHistoryEntry(entry.id)
      toast.success('Schedule archived.')
    }
  }

  async function handleDelete(entry: DisplayEntry) {
    if (entry.source === 'backend') {
      try {
        await schedulesApi.delete(entry.id)
        toast.success('Entry removed from history.')
      } catch {
        toast.error('Failed to delete. Please try again.')
      }
    } else {
      deleteHistoryEntry(entry.id)
      toast.success('Entry removed from history.')
    }
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

                  {/* KPIs */}
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
                      onClick={() => handleExport(entry)}
                      className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                      title="Export JSON"
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    {entry.status !== 'archived' && (
                      <button
                        onClick={() => handleArchive(entry)}
                        className="p-2 rounded-xl text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-all"
                        title="Archive"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(entry)}
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
