import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, Users, CalendarDays, Briefcase, X, Check, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLobStore } from '../store/lobStore'
import { apiClient } from '../api/client'
import type { LineOfBusiness } from '../types'

// ─── Calendar types ───────────────────────────────────────────────────────────
interface LobScheduleItem {
  id: string; name: string
  fromDate: string | null; toDate: string | null; weekStartDate: string
  agentsJson: string; rosterJson: string; breaksJson: string
}
interface CalAgent { name: string; shift: string; break1: string; lunch: string; break2: string }

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']
const WFM_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const JS_TO_WFM = [6,0,1,2,3,4,5] // Sun=6,Mon=0,...Sat=5

function toDs(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const PRESET_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444',
  '#f97316','#eab308','#22c55e','#14b8a6',
  '#0ea5e9','#3b82f6','#64748b','#6b7280',
]

interface LobFormData {
  name: string
  description: string
  color: string
}

const EMPTY: LobFormData = { name: '', description: '', color: '#6366f1' }

export default function LobManagement() {
  const { lobs, loading, fetchLobs, addLob, updateLob, deleteLob } = useLobStore()
  const [modalOpen, setModalOpen]   = useState(false)
  const [editingLob, setEditingLob] = useState<LineOfBusiness | null>(null)
  const [form, setForm]             = useState<LobFormData>(EMPTY)
  const [errors, setErrors]         = useState<Partial<LobFormData>>({})
  const [saving, setSaving]         = useState(false)

  useEffect(() => { fetchLobs() }, [])

  useEffect(() => {
    if (editingLob) {
      setForm({ name: editingLob.name, description: editingLob.description ?? '', color: editingLob.color })
    } else {
      setForm(EMPTY)
    }
    setErrors({})
  }, [editingLob, modalOpen])

  function validate() {
    const e: Partial<LobFormData> = {}
    if (!form.name.trim()) e.name = 'Name is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || undefined, color: form.color }
      if (editingLob) {
        await updateLob(editingLob.id, payload)
        toast.success('Line of Business updated.')
      } else {
        await addLob(payload)
        toast.success('Line of Business created.')
      }
      setModalOpen(false)
      setEditingLob(null)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(lob: LineOfBusiness) {
    if (!confirm(`Delete "${lob.name}"? Agents assigned to this LOB will be unassigned.`)) return
    try {
      await deleteLob(lob.id)
      toast.success('Line of Business deleted.')
    } catch {
      toast.error('Failed to delete.')
    }
  }

  function openCreate() { setEditingLob(null); setModalOpen(true) }
  function openEdit(lob: LineOfBusiness) { setEditingLob(lob); setModalOpen(true) }

  // ── Calendar state ────────────────────────────────────────────────────────
  const [calLob,       setCalLob]       = useState<LineOfBusiness | null>(null)
  const [calYear,      setCalYear]      = useState(new Date().getFullYear())
  const [calMonth,     setCalMonth]     = useState(new Date().getMonth())
  const [calSchedules, setCalSchedules] = useState<LobScheduleItem[]>([])
  const [calAgents,    setCalAgents]    = useState<Record<string,string>>({}) // uuid→name
  const [calLoading,   setCalLoading]   = useState(false)
  const [selDate,      setSelDate]      = useState<string | null>(null)

  useEffect(() => {
    if (!calLob) return
    setCalLoading(true)
    const from = `${calYear}-${String(calMonth+1).padStart(2,'0')}-01`
    const last = new Date(calYear, calMonth+1, 0).getDate()
    const to   = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`
    Promise.all([
      apiClient.get<LobScheduleItem[]>(`/schedules?lobId=${calLob.id}&from=${from}&to=${to}`),
      apiClient.get<Array<{id:string; name:string}>>('/agents'),
    ]).then(([sr, ar]) => {
      setCalSchedules(sr.data)
      const m: Record<string,string> = {}
      for (const a of ar.data) m[a.id] = a.name
      setCalAgents(m)
    }).catch(() => {}).finally(() => setCalLoading(false))
  }, [calLob, calYear, calMonth])

  // Days covered by any schedule
  const coveredDates = useMemo(() => {
    const s = new Set<string>()
    for (const sch of calSchedules) {
      const from = (sch.fromDate ?? sch.weekStartDate).split('T')[0]
      const to   = (sch.toDate  ?? sch.weekStartDate).split('T')[0]
      const cur  = new Date(from + 'T00:00:00')
      const end  = new Date(to   + 'T00:00:00')
      while (cur <= end) { s.add(toDs(cur)); cur.setDate(cur.getDate()+1) }
    }
    return s
  }, [calSchedules])

  // Agents for selected date
  const selDayAgents = useMemo((): CalAgent[] => {
    if (!selDate) return []
    const sch = calSchedules.find(s => {
      const from = (s.fromDate ?? s.weekStartDate).split('T')[0]
      const to   = (s.toDate  ?? s.weekStartDate).split('T')[0]
      return selDate >= from && selDate <= to
    })
    if (!sch) return []
    const wd  = WFM_DAYS[JS_TO_WFM[new Date(selDate+'T00:00:00').getDay()]]
    const slots: Array<{id:string; agentId:string|null}> = JSON.parse(sch.agentsJson)
    const roster: Array<Record<string,string>>            = JSON.parse(sch.rosterJson)
    let   breaks: Array<Record<string,string>>            = []
    try { breaks = JSON.parse(sch.breaksJson) } catch { /* */ }
    const slotMap: Record<string,string|null> = {}
    for (const sa of slots) slotMap[sa.id] = sa.agentId
    return roster
      .filter(r => r[wd] && r[wd] !== 'OFF')
      .map(r => {
        const agId = slotMap[r.agent] ?? null
        const br   = breaks.find(b => b.agent === r.agent)
        return {
          name:   (agId && calAgents[agId]) ? calAgents[agId] : `Slot ${r.agent}`,
          shift:  r[wd],
          break1: br?.[`${wd}_Break_1`] ?? '—',
          lunch:  br?.[`${wd}_Lunch`]   ?? '—',
          break2: br?.[`${wd}_Break_2`] ?? '—',
        }
      })
  }, [selDate, calSchedules, calAgents])

  // Calendar grid (Mon-first weeks)
  const calDays = useMemo(() => {
    const first   = new Date(calYear, calMonth, 1)
    const lastNum = new Date(calYear, calMonth+1, 0).getDate()
    const startOff = first.getDay() === 0 ? 6 : first.getDay()-1
    const days: (Date|null)[] = Array(startOff).fill(null)
    for (let d=1; d<=lastNum; d++) days.push(new Date(calYear, calMonth, d))
    return days
  }, [calYear, calMonth])

  function openCal(lob: LineOfBusiness) {
    setCalLob(lob); setCalYear(new Date().getFullYear())
    setCalMonth(new Date().getMonth()); setSelDate(null)
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Lines of Business</h1>
          <p className="text-sm text-gray-500 mt-0.5">Organise agents and schedules by business unit</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white
                     font-semibold rounded-xl px-4 py-2.5 text-sm transition-all shadow-glow-sm"
        >
          <Plus className="w-4 h-4" />
          New LOB
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total LOBs',    value: lobs.length,                              icon: Briefcase },
          { label: 'Total Agents',  value: lobs.reduce((s, l) => s + (l._count?.agents ?? 0), 0),    icon: Users },
          { label: 'Total Schedules', value: lobs.reduce((s, l) => s + (l._count?.schedules ?? 0), 0), icon: CalendarDays },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <s.icon className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* LOB cards grid */}
      {loading ? (
        <div className="text-center text-gray-400 py-12 text-sm">Loading…</div>
      ) : lobs.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
          <Briefcase className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No Lines of Business yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first LOB to start organising agents and schedules.</p>
          <button onClick={openCreate} className="mt-4 text-sm font-semibold text-brand-600 hover:underline">
            + Create LOB
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {lobs.map((lob) => (
              <motion.div
                key={lob.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow group"
              >
                {/* Colour bar */}
                <div className="h-1.5 rounded-full mb-4" style={{ backgroundColor: lob.color }} />

                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 truncate">{lob.name}</h3>
                    {lob.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{lob.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => openCal(lob)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50"
                      title="View schedule calendar"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openEdit(lob)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(lob)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {lob._count?.agents ?? 0} agent{(lob._count?.agents ?? 0) !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {lob._count?.schedules ?? 0} schedule{(lob._count?.schedules ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Calendar Modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {calLob && (
          <>
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              onClick={() => setCalLob(null)}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" />
            <motion.div initial={{ opacity:0, scale:0.95, y:16 }} animate={{ opacity:1, scale:1, y:0 }}
              exit={{ opacity:0, scale:0.95 }} transition={{ duration:0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                  <div>
                    <h2 className="font-bold text-gray-900">Schedule Calendar</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{calLob.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { const d=new Date(calYear,calMonth-1,1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); setSelDate(null) }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold text-gray-700 w-36 text-center">
                      {MONTH_NAMES[calMonth]} {calYear}
                    </span>
                    <button onClick={() => { const d=new Date(calYear,calMonth+1,1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); setSelDate(null) }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button onClick={() => setCalLob(null)}
                      className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                  {/* Calendar grid */}
                  <div className="flex-1 p-4 overflow-y-auto">
                    {calLoading ? (
                      <div className="text-center text-gray-400 py-12 text-sm">Loading…</div>
                    ) : (
                      <>
                        {/* Day headers */}
                        <div className="grid grid-cols-7 mb-1">
                          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                            <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
                          ))}
                        </div>
                        {/* Day cells */}
                        <div className="grid grid-cols-7 gap-1">
                          {calDays.map((day, i) => {
                            if (!day) return <div key={`empty-${i}`} />
                            const ds      = toDs(day)
                            const covered = coveredDates.has(ds)
                            const sel     = selDate === ds
                            const today   = toDs(new Date()) === ds
                            return (
                              <button key={ds}
                                onClick={() => covered && setSelDate(sel ? null : ds)}
                                disabled={!covered}
                                className={`relative rounded-xl py-2 text-xs font-semibold transition-all
                                  ${sel     ? 'bg-brand-600 text-white shadow-glow-sm' :
                                    covered ? 'bg-brand-50 text-brand-700 hover:bg-brand-100 cursor-pointer' :
                                              'text-gray-300 cursor-default'}
                                  ${today && !sel ? 'ring-2 ring-brand-300' : ''}`}
                              >
                                {day.getDate()}
                                {covered && !sel && (
                                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-400" />
                                )}
                              </button>
                            )
                          })}
                        </div>
                        {calSchedules.length === 0 && (
                          <p className="text-center text-xs text-gray-400 mt-6">
                            No schedules for this month.
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Day detail panel */}
                  {selDate && (
                    <div className="w-64 border-l border-gray-100 p-4 overflow-y-auto shrink-0">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        {new Date(selDate+'T00:00:00').toLocaleDateString('en-GB',
                          { weekday:'short', day:'numeric', month:'short' })}
                      </p>
                      {selDayAgents.length === 0 ? (
                        <p className="text-xs text-gray-400">No agents scheduled.</p>
                      ) : (
                        <div className="space-y-2">
                          {selDayAgents.map((ag, i) => (
                            <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                              <p className="text-xs font-semibold text-gray-900 mb-1.5">{ag.name}</p>
                              <div className="space-y-1 text-[10px] text-gray-600">
                                <div className="flex justify-between">
                                  <span className="text-gray-400">Shift</span>
                                  <span className="font-medium text-gray-800">{ag.shift}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400">Break 1</span>
                                  <span>{ag.break1}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400">Lunch</span>
                                  <span>{ag.lunch}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400">Break 2</span>
                                  <span>{ag.break2}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setModalOpen(false); setEditingLob(null) }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-200">
                  <h2 className="font-bold text-gray-900">
                    {editingLob ? 'Edit Line of Business' : 'New Line of Business'}
                  </h2>
                  <button onClick={() => { setModalOpen(false); setEditingLob(null) }}
                    className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Form */}
                <div className="p-5 space-y-4">

                  {/* Colour preview bar */}
                  <div className="h-2 rounded-full transition-all" style={{ backgroundColor: form.color }} />

                  {/* Name */}
                  <div>
                    <label className="label">Name *</label>
                    <input
                      className={`input ${errors.name ? 'border-red-400' : ''}`}
                      placeholder="e.g. Customer Service"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                    {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="label">Description</label>
                    <input
                      className="input"
                      placeholder="Optional description"
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>

                  {/* Colour picker */}
                  <div>
                    <label className="label">Colour</label>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setForm((f) => ({ ...f, color: c }))}
                          className="w-7 h-7 rounded-lg border-2 transition-all"
                          style={{
                            backgroundColor: c,
                            borderColor: form.color === c ? '#1e293b' : 'transparent',
                          }}
                        >
                          {form.color === c && <Check className="w-3 h-3 text-white mx-auto" />}
                        </button>
                      ))}
                      <input
                        type="color"
                        value={form.color}
                        onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                        className="w-7 h-7 rounded-lg cursor-pointer border border-gray-200"
                        title="Custom colour"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-1">
                    <button
                      onClick={() => { setModalOpen(false); setEditingLob(null) }}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-5 py-2 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-500
                                 text-white transition-all disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : editingLob ? 'Save Changes' : 'Create LOB'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
