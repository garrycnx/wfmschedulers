import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Clock, CalendarOff, RotateCcw, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'
import type { Agent } from '../../types'

const API = `${import.meta.env.VITE_API_URL ?? ''}/api`

interface ShiftOverride {
  id: string
  agentId: string
  overrideDate: string
  shiftStart: string | null
  shiftEnd: string | null
  isOff: boolean
  note: string | null
}

interface Props {
  open: boolean
  agent: Agent | null
  onClose: () => void
}

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function toYMD(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export default function ShiftCalendarModal({ open, agent, onClose }: Props) {
  const today = new Date()
  const [viewYear, setViewYear]   = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1) // 1-based
  const [overrides, setOverrides] = useState<Record<string, ShiftOverride>>({}) // keyed by YYYY-MM-DD
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    isOff: false,
    shiftStart: '09:00',
    shiftEnd: '18:00',
    note: '',
  })

  // ── Fetch overrides for current month ────────────────────────────────────
  const fetchOverrides = useCallback(async () => {
    if (!agent) return
    try {
      const res = await axios.get<ShiftOverride[]>(
        `${API}/agents/${agent.id}/overrides`,
        { params: { year: viewYear, month: viewMonth },
          headers: { Authorization: `Bearer ${localStorage.getItem('wfm-auth') ? JSON.parse(localStorage.getItem('wfm-auth')!).state?.token : ''}` } }
      )
      const map: Record<string, ShiftOverride> = {}
      res.data.forEach((o) => {
        const d = new Date(o.overrideDate)
        map[toYMD(d)] = o
      })
      setOverrides(map)
    } catch {
      // silent
    }
  }, [agent, viewYear, viewMonth])

  useEffect(() => {
    if (open && agent) fetchOverrides()
  }, [open, agent, viewYear, viewMonth, fetchOverrides])

  // Reset selection when modal opens/closes
  useEffect(() => {
    if (!open) { setSelectedDay(null); setOverrides({}) }
  }, [open])

  // Populate edit form when day is selected
  useEffect(() => {
    if (!selectedDay) return
    const existing = overrides[selectedDay]
    if (existing) {
      setEditForm({
        isOff:      existing.isOff,
        shiftStart: existing.shiftStart ?? '09:00',
        shiftEnd:   existing.shiftEnd   ?? '18:00',
        note:       existing.note ?? '',
      })
    } else {
      setEditForm({ isOff: false, shiftStart: '09:00', shiftEnd: '18:00', note: '' })
    }
  }, [selectedDay, overrides])

  // ── Calendar grid generation ──────────────────────────────────────────────
  function buildCalendarDays() {
    const firstDay = new Date(Date.UTC(viewYear, viewMonth - 1, 1))
    const lastDay  = new Date(Date.UTC(viewYear, viewMonth, 0))
    // Monday = 0 … Sunday = 6
    const startOffset = (firstDay.getUTCDay() + 6) % 7
    const days: (number | null)[] = Array(startOffset).fill(null)
    for (let d = 1; d <= lastDay.getUTCDate(); d++) days.push(d)
    while (days.length % 7 !== 0) days.push(null)
    return days
  }

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) }
    else setViewMonth(m => m - 1)
    setSelectedDay(null)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) }
    else setViewMonth(m => m + 1)
    setSelectedDay(null)
  }

  // ── Save / clear ──────────────────────────────────────────────────────────
  const token = localStorage.getItem('wfm-auth')
    ? JSON.parse(localStorage.getItem('wfm-auth')!).state?.token ?? ''
    : ''
  const headers = { Authorization: `Bearer ${token}` }

  async function handleSave() {
    if (!agent || !selectedDay) return
    setSaving(true)
    try {
      await axios.post(`${API}/agents/${agent.id}/overrides`, {
        date:       selectedDay,
        isOff:      editForm.isOff,
        shiftStart: editForm.isOff ? null : editForm.shiftStart,
        shiftEnd:   editForm.isOff ? null : editForm.shiftEnd,
        note:       editForm.note || null,
      }, { headers })
      toast.success('Shift override saved.')
      fetchOverrides()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Failed to save override.')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!agent || !selectedDay) return
    setSaving(true)
    try {
      await axios.delete(`${API}/agents/${agent.id}/overrides/${selectedDay}`, { headers })
      toast.success('Override cleared — back to regular shift.')
      fetchOverrides()
      setSelectedDay(null)
    } catch {
      toast.error('Failed to clear override.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const days = buildCalendarDays()
  const todayYMD = toYMD(today)

  return (
    <AnimatePresence>
      {open && agent && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-lg">

              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-gray-200">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Shift Calendar</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {agent.name} · <span className="font-mono">{agent.agentCode}</span>
                  </p>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">

                {/* Month navigator */}
                <div className="flex items-center justify-between">
                  <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-gray-900">
                    {MONTH_NAMES[viewMonth - 1]} {viewYear}
                  </span>
                  <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Calendar grid */}
                <div>
                  {/* Day labels */}
                  <div className="grid grid-cols-7 mb-1">
                    {DAY_LABELS.map((l) => (
                      <div key={l} className="text-center text-[10px] font-semibold text-gray-400 py-1">{l}</div>
                    ))}
                  </div>
                  {/* Day cells */}
                  <div className="grid grid-cols-7 gap-0.5">
                    {days.map((day, i) => {
                      if (!day) return <div key={`empty-${i}`} />
                      const ymd = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                      const override = overrides[ymd]
                      const isToday    = ymd === todayYMD
                      const isSelected = ymd === selectedDay
                      const isOff      = override?.isOff
                      const hasOverride = !!override && !isOff

                      return (
                        <button
                          key={ymd}
                          onClick={() => setSelectedDay(ymd)}
                          className={[
                            'relative flex flex-col items-center justify-center rounded-xl py-1.5 text-xs transition-all',
                            isSelected
                              ? 'bg-brand-600 text-white font-bold shadow-glow-sm'
                              : isOff
                              ? 'bg-red-50 text-red-500 font-semibold hover:bg-red-100'
                              : hasOverride
                              ? 'bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100'
                              : 'hover:bg-gray-100 text-gray-700',
                            isToday && !isSelected ? 'ring-2 ring-brand-400 ring-offset-1' : '',
                          ].join(' ')}
                        >
                          <span>{day}</span>
                          {isOff && <span className="text-[8px] leading-none mt-0.5">OFF</span>}
                          {hasOverride && (
                            <span className="text-[8px] leading-none mt-0.5 truncate w-full text-center px-0.5">
                              {override.shiftStart}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 inline-block" />Override</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" />Day Off</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded ring-2 ring-brand-400 inline-block" />Today</span>
                </div>

                {/* Day edit panel */}
                {selectedDay && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-900">
                        {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-GB', {
                          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </p>
                      {overrides[selectedDay] && (
                        <button
                          onClick={handleClear}
                          disabled={saving}
                          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-500 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Clear override
                        </button>
                      )}
                    </div>

                    {/* Working / Off toggle */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditForm(f => ({ ...f, isOff: false }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          !editForm.isOff
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        Working
                      </button>
                      <button
                        onClick={() => setEditForm(f => ({ ...f, isOff: true }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          editForm.isOff
                            ? 'bg-red-500 text-white border-red-500'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <CalendarOff className="w-3 h-3" />
                        Day Off
                      </button>
                    </div>

                    {/* Times (hidden when off) */}
                    {!editForm.isOff && (
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Start</label>
                          <input
                            type="time"
                            className="input mt-1 text-sm"
                            value={editForm.shiftStart}
                            onChange={(e) => setEditForm(f => ({ ...f, shiftStart: e.target.value }))}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">End</label>
                          <input
                            type="time"
                            className="input mt-1 text-sm"
                            value={editForm.shiftEnd}
                            onChange={(e) => setEditForm(f => ({ ...f, shiftEnd: e.target.value }))}
                          />
                        </div>
                      </div>
                    )}

                    {/* Note */}
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Note (optional)</label>
                      <input
                        className="input mt-1 text-sm"
                        placeholder="e.g. Covering for Alice"
                        value={editForm.note}
                        onChange={(e) => setEditForm(f => ({ ...f, note: e.target.value }))}
                      />
                    </div>

                    {/* Save button */}
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500
                                 text-white text-sm font-semibold rounded-xl py-2 transition-all disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Saving…' : 'Save Override'}
                    </button>
                  </motion.div>
                )}

                {!selectedDay && (
                  <p className="text-center text-xs text-gray-400 py-2">
                    Click any day to set a shift override for that date
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
