import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Users, CalendarCheck, TrendingUp, Activity, Plus, X, LayoutGrid,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useLobStore } from '../store/lobStore'
import { agentsApi, apiClient } from '../api/client'
import { erlangAEstimates } from '../utils/erlang'
import type { Agent, RosterRow, DayProjection } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────
interface DashSchedule {
  id: string
  name: string
  weekStartDate: string
  fromDate: string | null
  toDate: string | null
  lobId: string | null
  status: string
  settingsJson: string
  forecastJson: string
  projectionsJson: string
  agentsJson: string
  rosterJson: string
  requiredJson: string
}

interface SlotAgent { id: string; agentId?: string; start: number; end: number; off: string[] }
interface RequiredRow { weekday: string; slotMin: number; slotLabel: string; required: number }
interface ForecastRow { weekday: string; slotMin: number; volume: number }
interface SchedSettings {
  ahtSeconds: number
  slaThresholdSeconds: number
  patienceSeconds: number
  intervalFormat?: string   // e.g. "30 minutes" | "15 minutes"
}
interface Override { isOff: boolean; shiftStart: string | null; shiftEnd: string | null }
type OverrideMap = Record<string, Record<string, Override>>  // agentId → dateStr → override

/** Compute Erlang-A weighted SLA% for a given day using only filled agents */
function computeActualSla(
  day: string,
  slotAgents: SlotAgent[],
  forecastRows: ForecastRow[],
  settings: SchedSettings,
): number {
  const ahtMinutes       = (settings.ahtSeconds ?? 360) / 60
  const slaThresholdMin  = (settings.slaThresholdSeconds ?? 20) / 60
  const patienceMinutes  = (settings.patienceSeconds ?? 120) / 60
  const intervalLengthMin = settings.intervalFormat?.startsWith('15') ? 15 : 30
  const mu    = 1 / ahtMinutes
  const theta = 1 / patienceMinutes
  const tSla  = slaThresholdMin

  let slaAcc = 0, totalVol = 0
  for (let slotMin = 0; slotMin < 24 * 60; slotMin += intervalLengthMin) {
    const volume = forecastRows.find(f => f.weekday === day && f.slotMin === slotMin)?.volume ?? 0
    if (volume <= 0) continue
    // Count only filled agents (agentId set) working this slot on this day
    const filled = slotAgents.filter(a =>
      a.agentId && !a.off.includes(day) && a.start <= slotMin && slotMin < a.end
    ).length
    const lam        = volume / intervalLengthMin
    const traffic    = lam / mu
    const { slaEst } = erlangAEstimates(traffic, filled, mu, theta, tSla)
    slaAcc   += (isNaN(slaEst) ? 0 : slaEst) * volume
    totalVol += volume
  }
  return totalVol > 0 ? +((slaAcc / totalVol) * 100).toFixed(1) : 0
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const WFM_DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const JS_WFM    = [6, 0, 1, 2, 3, 4, 5]
const SHORT_M   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function parseLoc(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function getWfmDay(d: Date): string { return WFM_DAYS[JS_WFM[d.getDay()]] }
function dateRange(from: string, to: string): Date[] {
  const out: Date[] = []
  const cur = parseLoc(from), end = parseLoc(to)
  while (cur <= end) { out.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
  return out
}
function parseShift(s: string): { start: number; end: number } | null {
  if (!s || s === 'OFF') return null
  const [a, b] = s.split('-')
  if (!a || !b) return null
  const [ah, am] = a.split(':').map(Number)
  const [bh, bm] = b.split(':').map(Number)
  return { start: ah * 60 + (am || 0), end: bh * 60 + (bm || 0) }
}
function minToStr(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`
}
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
function thisMonday() {
  const d = new Date()
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay()
  d.setDate(d.getDate() + diff)
  return toDateStr(d)
}
function thisSunday() {
  const d = parseLoc(thisMonday())
  d.setDate(d.getDate() + 6)
  return toDateStr(d)
}

// For schedules that may lack fromDate/toDate, fall back to settingsJson releaseFrom/To
function getScheduleRange(s: DashSchedule): { from: string; to: string } {
  if (s.fromDate && s.toDate) {
    return { from: s.fromDate.split('T')[0], to: s.toDate.split('T')[0] }
  }
  try {
    const st = JSON.parse(s.settingsJson) as { releaseFrom?: string; releaseTo?: string }
    if (st.releaseFrom && st.releaseTo) return { from: st.releaseFrom, to: st.releaseTo }
  } catch { /* */ }
  // Last resort: week starting at weekStartDate
  const d = parseLoc(s.weekStartDate.split('T')[0])
  const e = new Date(d); e.setDate(d.getDate() + 6)
  return { from: toDateStr(d), to: toDateStr(e) }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate   = useNavigate()
  const user       = useAuthStore(s => s.user)
  const { lobs, fetchLobs } = useLobStore()

  const [dateFrom,    setDateFrom]    = useState(thisMonday())
  const [dateTo,      setDateTo]      = useState(thisSunday())
  const [lobId,       setLobId]       = useState('')
  const [schedules,   setSchedules]   = useState<DashSchedule[]>([])
  const [agents,      setAgents]      = useState<Agent[]>([])
  const [loading,     setLoading]     = useState(false)
  const [openModal,   setOpenModal]   = useState(false)
  const [ovLoading,   setOvLoading]   = useState(false)
  const [overrideMap, setOverrideMap] = useState<OverrideMap>({})

  // Edit cell state
  const [editCell,  setEditCell]  = useState<{ agentId: string; date: string; agentName: string } | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd,   setEditEnd]   = useState('')
  const [editOff,   setEditOff]   = useState(false)
  const [saving,    setSaving]    = useState(false)

  // ── Fetch agents + LOBs on mount ─────────────────────────────────
  useEffect(() => {
    fetchLobs()
    agentsApi.list().then(r => setAgents(r.data)).catch(() => {})
  }, [])

  // ── Fetch schedules on filter change ─────────────────────────────
  const fetchSchedules = useCallback(async () => {
    if (!dateFrom || !dateTo || dateTo < dateFrom) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo })
      if (lobId) params.set('lobId', lobId)
      const res = await apiClient.get<DashSchedule[]>(`/schedules?${params}`)
      setSchedules(res.data)
    } catch {
      toast.error('Failed to load schedules.')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, lobId])

  useEffect(() => { fetchSchedules() }, [fetchSchedules])

  // ── Parsed schedule data ─────────────────────────────────────────
  const parsed = useMemo(() => schedules.map(s => ({
    ...s,
    range:        getScheduleRange(s),
    slotAgents:   JSON.parse(s.agentsJson)      as SlotAgent[],
    roster:       JSON.parse(s.rosterJson)      as RosterRow[],
    projections:  JSON.parse(s.projectionsJson) as DayProjection[],
    required:     JSON.parse(s.requiredJson)    as RequiredRow[],
    forecastRows: JSON.parse(s.forecastJson || '[]') as ForecastRow[],
    schedSettings:JSON.parse(s.settingsJson)    as SchedSettings,
  })), [schedules])

  // ── KPIs ─────────────────────────────────────────────────────────
  const uniqueAgentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of parsed)
      for (const a of s.slotAgents)
        if (a.agentId) ids.add(a.agentId)
    return ids
  }, [parsed])

  const avgKpis = useMemo(() => {
    const all = parsed.flatMap(s => s.projections)
    if (!all.length) return { projectedSla: 0, actualSla: 0, occupancy: 0 }
    // Projected SLA: from stored projections (full roster design)
    const projectedSla = +(all.reduce((a, p) => a + p.projectedSLAPct, 0) / all.length).toFixed(1)
    const occupancy    = +(all.reduce((a, p) => a + p.avgOccupancyPct, 0) / all.length).toFixed(1)
    // Actual SLA: re-compute using only filled agents across all days in range
    const actualVals = dateRange(dateFrom, dateTo).flatMap(date => {
      const ds  = toDateStr(date)
      const day = getWfmDay(date)
      const sch = parsed.find(s => s.range.from <= ds && s.range.to >= ds)
      if (!sch?.projections.find(p => p.day === day)) return []
      return [computeActualSla(day, sch.slotAgents, sch.forecastRows, sch.schedSettings)]
    })
    const actualSla = actualVals.length
      ? +(actualVals.reduce((a, v) => a + v, 0) / actualVals.length).toFixed(1)
      : 0
    return { projectedSla, actualSla, occupancy }
  }, [parsed, dateFrom, dateTo])

  // ── SLA day-by-day chart ──────────────────────────────────────────
  const slaChartData = useMemo(() => {
    return dateRange(dateFrom, dateTo).flatMap(date => {
      const ds  = toDateStr(date)
      const day = getWfmDay(date)
      const sch = parsed.find(s => s.range.from <= ds && s.range.to >= ds)
      const proj = sch?.projections.find(p => p.day === day)
      if (!proj) return []
      const actualSla = sch
        ? computeActualSla(day, sch.slotAgents, sch.forecastRows, sch.schedSettings)
        : 0
      return [{
        date:      `${DAY_SHORT[date.getDay()]} ${date.getDate()} ${SHORT_M[date.getMonth()]}`,
        sla:       +proj.projectedSLAPct.toFixed(1),
        actualSla,
        abandon:   +proj.projectedAbandonPct.toFixed(1),
      }]
    })
  }, [parsed, dateFrom, dateTo])

  // ── Interval staffing chart ───────────────────────────────────────
  const staffingChartData = useMemo(() => {
    const out: { slot: string; staffed: number; required: number }[] = []
    for (let min = 0; min < 24 * 60; min += 30) {
      let staffedSum = 0, requiredSum = 0, count = 0
      for (const s of parsed) {
        for (const day of WFM_DAYS) {
          // Only count weekdays that actually have scheduled agents
          const hasWork = s.roster.some(rr => parseShift(rr[day] ?? '') !== null)
          if (!hasWork) continue
          const atSlot = s.roster.filter(rr => {
            const sh = parseShift(rr[day] ?? '')
            return sh && sh.start <= min && min < sh.end
          }).length
          const req = s.required.find(r => r.weekday === day && r.slotMin === min)
          staffedSum  += atSlot
          requiredSum += req?.required ?? 0
          count++
        }
      }
      if (count > 0 && (staffedSum > 0 || requiredSum > 0)) {
        out.push({
          slot:     minToStr(min),
          staffed:  +(staffedSum  / count).toFixed(1),
          required: +(requiredSum / count).toFixed(1),
        })
      }
    }
    return out
  }, [parsed])

  // ── Grid dates + date → schedule map ─────────────────────────────
  const gridDates = useMemo(() => dateRange(dateFrom, dateTo), [dateFrom, dateTo])

  const dateToSched = useMemo(() => {
    const m: Record<string, typeof parsed[0] | undefined> = {}
    for (const date of gridDates) {
      const ds = toDateStr(date)
      m[ds] = parsed.find(s => s.range.from <= ds && s.range.to >= ds)
    }
    return m
  }, [parsed, gridDates])

  const agentNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const a of agents) m[a.id] = a.name
    return m
  }, [agents])

  // ── Get shift for a cell (applies override if any) ────────────────
  function getShift(agentId: string, date: Date): string {
    const ds  = toDateStr(date)
    const ov  = overrideMap[agentId]?.[ds]
    if (ov) {
      if (ov.isOff) return 'OFF'
      if (ov.shiftStart && ov.shiftEnd) return `${ov.shiftStart}-${ov.shiftEnd}`
    }
    const sch = dateToSched[ds]
    if (!sch) return '—'
    const slot = sch.slotAgents.find(a => a.agentId === agentId)
    if (!slot) return '—'
    const rr = sch.roster.find(r => r.agent === slot.id)
    if (!rr) return '—'
    return rr[getWfmDay(date)] ?? '—'
  }

  // ── Open modal + load overrides ───────────────────────────────────
  async function handleOpenModal() {
    setOpenModal(true)
    if (!uniqueAgentIds.size) return
    setOvLoading(true)
    try {
      const results = await Promise.all(
        [...uniqueAgentIds].map(agId =>
          apiClient.get(`/agents/${agId}/overrides?from=${dateFrom}&to=${dateTo}`)
            .then(r => ({ agId, ovs: r.data as Array<{ overrideDate: string; isOff: boolean; shiftStart: string | null; shiftEnd: string | null }> }))
            .catch(() => ({ agId, ovs: [] }))
        )
      )
      const map: OverrideMap = {}
      for (const { agId, ovs } of results) {
        map[agId] = {}
        for (const ov of ovs) {
          map[agId][ov.overrideDate.split('T')[0]] = {
            isOff: ov.isOff, shiftStart: ov.shiftStart, shiftEnd: ov.shiftEnd,
          }
        }
      }
      setOverrideMap(map)
    } finally {
      setOvLoading(false)
    }
  }

  // ── Open edit modal for a cell ────────────────────────────────────
  function openEdit(agentId: string, date: Date) {
    const shift = getShift(agentId, date)
    if (shift === '—') return
    const ds  = toDateStr(date)
    const ov  = overrideMap[agentId]?.[ds]
    if (ov) {
      setEditOff(ov.isOff)
      setEditStart(ov.shiftStart ?? '')
      setEditEnd(ov.shiftEnd ?? '')
    } else {
      const parsed = parseShift(shift)
      setEditOff(shift === 'OFF')
      setEditStart(parsed ? minToStr(parsed.start) : '')
      setEditEnd(parsed   ? minToStr(parsed.end)   : '')
    }
    setEditCell({ agentId, date: ds, agentName: agentNameMap[agentId] ?? agentId })
  }

  async function saveEdit() {
    if (!editCell) return
    setSaving(true)
    try {
      await apiClient.post(`/agents/${editCell.agentId}/overrides`, {
        date:       editCell.date,
        isOff:      editOff,
        shiftStart: editOff ? null : editStart || null,
        shiftEnd:   editOff ? null : editEnd   || null,
      })
      setOverrideMap(prev => ({
        ...prev,
        [editCell.agentId]: {
          ...(prev[editCell.agentId] ?? {}),
          [editCell.date]: {
            isOff: editOff,
            shiftStart: editOff ? null : editStart || null,
            shiftEnd:   editOff ? null : editEnd   || null,
          },
        },
      }))
      toast.success('Shift updated — agent portal reflects the change.')
      setEditCell(null)
    } catch {
      toast.error('Failed to save shift.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Good {greeting()}, {user?.name?.split(' ')[0]}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Select a date range and LOB to view your workforce data.</p>
        </div>
        <button
          onClick={() => navigate('/generate')}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold
                     rounded-xl px-4 py-2.5 text-sm transition-all shadow-glow-sm"
        >
          <Plus className="w-4 h-4" />
          New Schedule
        </button>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[160px]">
          <label className="label">Line of Business</label>
          <select className="input" value={lobId} onChange={e => setLobId(e.target.value)}>
            <option value="">All LOBs</option>
            {lobs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)} />
        </div>
        {schedules.length > 0 && (
          <button
            onClick={handleOpenModal}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-700 text-white font-semibold
                       rounded-xl px-4 py-2.5 text-sm transition-all"
          >
            <LayoutGrid className="w-4 h-4" />
            Open Schedules
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center text-gray-400 py-12 text-sm">Loading schedules…</div>
      )}

      {/* Empty state */}
      {!loading && schedules.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
          <CalendarCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No schedules found for this period</p>
          <p className="text-sm text-gray-400 mt-1">Adjust the date range or generate a new schedule.</p>
          <button onClick={() => navigate('/generate')}
            className="mt-4 text-sm font-semibold text-brand-600 hover:underline">
            + Generate Schedule
          </button>
        </div>
      )}

      {/* ── Data views ─────────────────────────────────────────────── */}
      {!loading && schedules.length > 0 && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Unique Agents Scheduled', value: String(uniqueAgentIds.size),                                          icon: Users,         color: 'brand'   },
              { label: 'Schedules in Range',       value: String(schedules.length),                                            icon: CalendarCheck, color: 'emerald' },
              { label: 'Actual SLA (Filled Slots)',value: avgKpis.actualSla    ? `${avgKpis.actualSla}%`    : '—',             icon: TrendingUp,    color: 'sky'     },
              { label: 'Projected SLA (Full Roster)',value: avgKpis.projectedSla ? `${avgKpis.projectedSla}%` : '—',           icon: Activity,      color: 'violet'  },
            ].map((kpi, i) => (
              <motion.div key={kpi.label} custom={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.3 } }}
                className="bg-white border border-gray-200 rounded-2xl p-5"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4
                  bg-${kpi.color}-500/15 border border-${kpi.color}-500/20`}>
                  <kpi.icon className={`w-5 h-5 text-${kpi.color}-500`} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                <p className="text-xs text-gray-500 mt-1">{kpi.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

            {/* SLA projection */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 xl:col-span-2">
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-gray-900">SLA Projection</h3>
                <p className="text-xs text-gray-500 mt-0.5">Projected SLA (full roster design) vs Actual SLA (filled agents only)</p>
              </div>
              {slaChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={slaChartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradSla" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#6370fa" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#6370fa" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="gradAbn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#f87171" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10 }}
                      labelStyle={{ color: '#374151', fontSize: 12 }}
                      itemStyle={{ fontSize: 12 }}
                      formatter={(val: number, name: string) => [`${val}%`, name]}
                    />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Area type="monotone" dataKey="sla"       name="Projected SLA" stroke="#6370fa" fill="url(#gradSla)"    strokeWidth={2} dot={false} strokeDasharray="5 3" />
                    <Area type="monotone" dataKey="actualSla" name="Actual SLA"     stroke="#10b981" fill="url(#gradActual)" strokeWidth={2.5} dot={false} />
                    <Area type="monotone" dataKey="abandon"   name="Abandon %"      stroke="#f87171" fill="url(#gradAbn)"    strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">
                  No projection data for this range
                </div>
              )}
            </div>

            {/* Interval staffing */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-gray-900">Interval Staffing</h3>
                <p className="text-xs text-gray-500 mt-0.5">Avg agents on shift vs. required (30-min)</p>
              </div>
              {staffingChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={staffingChartData} margin={{ top: 5, right: 0, left: -30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="slot" tick={{ fontSize: 9, fill: '#6b7280' }} interval={3} />
                    <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10 }}
                      labelStyle={{ color: '#374151', fontSize: 12 }}
                      itemStyle={{ fontSize: 12 }}
                    />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Bar dataKey="staffed"  name="Staffed"  fill="#6370fa" radius={[3,3,0,0]} />
                    <Bar dataKey="required" name="Required" fill="#f59e0b" radius={[3,3,0,0]} fillOpacity={0.7} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">
                  No staffing data available
                </div>
              )}
            </div>
          </div>

          {/* Schedules table */}
          <div className="bg-white border border-gray-200 rounded-2xl">
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Schedules in Selected Range</h3>
              <p className="text-xs text-gray-500 mt-0.5">{schedules.length} schedule{schedules.length !== 1 ? 's' : ''} found</p>
            </div>
            <table className="wfm-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Name</th>
                  <th className="text-left">LOB</th>
                  <th className="text-center">Period</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Agents</th>
                  <th className="text-center">Avg SLA</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map(s => {
                  const lob       = lobs.find(l => l.id === s.lobId)
                  const agCount   = new Set(s.slotAgents.filter(a => a.agentId).map(a => a.agentId!)).size
                  const projCount = s.projections.length || 1
                  const avgSla    = +(s.projections.reduce((sum, p) => sum + p.projectedSLAPct, 0) / projCount).toFixed(1)
                  return (
                    <tr key={s.id}>
                      <td className="font-medium text-gray-900">{s.name}</td>
                      <td>
                        {lob
                          ? <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: lob.color }} />
                              <span className="text-xs text-gray-700">{lob.name}</span>
                            </span>
                          : <span className="text-xs text-gray-400">—</span>
                        }
                      </td>
                      <td className="text-center text-xs text-gray-500">
                        {s.range.from} → {s.range.to}
                      </td>
                      <td className="text-center">
                        <span className={
                          s.status === 'published' ? 'badge-green' :
                          s.status === 'draft'     ? 'badge-yellow' : 'badge-slate'
                        }>{s.status}</span>
                      </td>
                      <td className="text-center text-gray-700">{agCount}</td>
                      <td className="text-center font-semibold">
                        <span className={avgSla >= 80 ? 'text-emerald-600' : 'text-amber-600'}>
                          {avgSla ? `${avgSla}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
           OPEN SCHEDULES MODAL – full agent × date grid
         ══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {openModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setOpenModal(false); setEditCell(null) }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />

            {/* Modal panel */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-4 z-50 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
                <div>
                  <h2 className="font-bold text-gray-900">
                    Schedule Roster — {dateFrom} to {dateTo}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {uniqueAgentIds.size} agent{uniqueAgentIds.size !== 1 ? 's' : ''} ·{' '}
                    {gridDates.length} days · click any shift cell to edit
                  </p>
                </div>
                <button
                  onClick={() => { setOpenModal(false); setEditCell(null) }}
                  className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-auto">
                {ovLoading ? (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    Loading overrides…
                  </div>
                ) : uniqueAgentIds.size === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    No agents assigned to schedules in this range.
                  </div>
                ) : (
                  <table className="w-full border-collapse" style={{ minWidth: `${160 + gridDates.length * 90}px` }}>
                    <thead>
                      <tr className="bg-gray-50">
                        {/* Sticky corner */}
                        <th className="sticky left-0 top-0 z-30 bg-gray-50 text-left text-xs font-semibold
                                       text-gray-500 px-4 py-3 border-b border-r border-gray-200 min-w-[160px]">
                          Agent
                        </th>
                        {gridDates.map(date => (
                          <th key={toDateStr(date)}
                            className="sticky top-0 z-10 bg-gray-50 text-center text-xs font-semibold
                                       text-gray-500 px-2 py-3 border-b border-gray-200 min-w-[88px]">
                            <div className="font-bold">{DAY_SHORT[date.getDay()]}</div>
                            <div className="text-gray-400 font-normal text-[10px]">
                              {date.getDate()} {SHORT_M[date.getMonth()]}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...uniqueAgentIds].map(agentId => (
                        <tr key={agentId} className="hover:bg-gray-50/60 transition-colors">
                          <td className="sticky left-0 z-20 bg-white border-r border-b border-gray-100
                                         px-4 py-2 font-medium text-sm text-gray-900 whitespace-nowrap">
                            {agentNameMap[agentId] ?? <span className="font-mono text-xs text-gray-400">{agentId.slice(0,8)}…</span>}
                          </td>
                          {gridDates.map(date => {
                            const ds    = toDateStr(date)
                            const shift = getShift(agentId, date)
                            const isOv  = !!overrideMap[agentId]?.[ds]
                            const isOff = shift === 'OFF'
                            const empty = shift === '—'
                            return (
                              <td key={ds} className="border-b border-gray-100 p-1 text-center">
                                <button
                                  onClick={() => !empty && openEdit(agentId, date)}
                                  disabled={empty}
                                  title={empty ? 'Not scheduled' : 'Click to edit'}
                                  className={`w-full rounded-lg px-1 py-2 text-[11px] font-medium leading-tight transition-all
                                    ${empty   ? 'text-gray-200 cursor-default' :
                                      isOff   ? 'bg-gray-100 text-gray-400 hover:bg-gray-200 cursor-pointer' :
                                      isOv    ? 'bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 cursor-pointer' :
                                                'bg-brand-50 text-brand-700 hover:bg-brand-100 cursor-pointer'
                                    }`}
                                >
                                  {empty ? '—' : isOff ? 'OFF' : (
                                    <>
                                      <div>{shift.split('-')[0]}</div>
                                      <div className="text-[10px] opacity-70">{shift.split('-')[1]}</div>
                                    </>
                                  )}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-5 px-6 py-3 border-t border-gray-100 text-[11px] text-gray-500 shrink-0">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-brand-50 border border-brand-300" /> Scheduled
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-amber-50 border border-amber-300" /> Overridden
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-gray-100" /> Day Off
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Edit Shift Mini-Modal (sits above the open modal) ──────── */}
      <AnimatePresence>
        {editCell && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditCell(null)}
              className="fixed inset-0 z-[60] bg-black/10"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed z-[70] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                         bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-80"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Edit Shift</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{editCell.agentName} · {editCell.date}</p>
                </div>
                <button onClick={() => setEditCell(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Day off toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setEditOff(v => !v)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${editOff ? 'bg-red-400' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform
                      ${editOff ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm text-gray-700 font-medium">Day Off</span>
                </label>

                {!editOff && (
                  <>
                    <div>
                      <label className="label">Shift Start</label>
                      <input type="time" className="input" value={editStart}
                        onChange={e => setEditStart(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Shift End</label>
                      <input type="time" className="input" value={editEnd}
                        onChange={e => setEditEnd(e.target.value)} />
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={() => setEditCell(null)}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={saving}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-500
                             text-white transition-all disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  )
}
