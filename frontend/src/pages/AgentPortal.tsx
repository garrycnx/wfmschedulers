import { useState, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  CalendarDays, Clock, Coffee, Utensils, LogOut,
  Sun, ChevronLeft, ChevronRight, Info, KeyRound, Eye, EyeOff, AlertCircle,
  CalendarOff, Plus, X,
} from 'lucide-react'
import type { RosterRow, BreakRow } from '../types'

const PORTAL_API = `${import.meta.env.VITE_API_URL ?? ''}/api/portal`

type LeaveType = 'Annual' | 'Sick' | 'Emergency' | 'Unpaid'
const LEAVE_TYPES: LeaveType[] = ['Annual', 'Sick', 'Emergency', 'Unpaid']

interface LeaveBalance {
  id:         string
  leaveType:  LeaveType
  totalHours: number
  usedHours:  number
  year:       number
}

interface LeaveRequest {
  id:           string
  leaveType:    LeaveType
  startDate:    string
  endDate:      string
  durationType: string
  totalHours:   number
  status:       string
  notes:        string | null
  createdAt:    string
}

const STATUS_COLORS: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border border-red-200',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface OverrideEntry { isOff: boolean; shiftStart: string | null; shiftEnd: string | null }

interface PortalData {
  released: boolean
  releaseRange: { from: string; to: string } | null
  rosterRow: RosterRow | null
  breakRow: BreakRow | null
  overrideMap: Record<string, OverrideEntry>
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DayEntry {
  day: string       // 'Mon', 'Tue', etc.
  date: number
  month: number
  year: number
  shift: string     // 'HH:MM–HH:MM' or 'OFF'
  break1: string
  lunch: string
  break2: string
  off: boolean
}

interface WeekEntry {
  weekLabel: string
  days: DayEntry[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const WFM_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// JS getDay(): 0=Sun, 1=Mon, …, 6=Sat  →  WFM_DAYS index
const JS_TO_WFM_IDX = [6, 0, 1, 2, 3, 4, 5]
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const FULL_MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function parseDateLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "HH:MM" → total minutes */
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
/** minutes → "HH:MM" clamped to 00:00–23:59 */
function minToTime(m: number): string {
  const c = Math.max(0, Math.min(23 * 60 + 59, m))
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`
}
/** Shift a "HH:MM-HH:MM" break range by offsetMin minutes */
function shiftBreak(range: string, offsetMin: number): string {
  if (!range || offsetMin === 0) return range
  const [s, e] = range.split('-')
  if (!s || !e) return range
  return `${minToTime(timeToMin(s) + offsetMin)}-${minToTime(timeToMin(e) + offsetMin)}`
}

/** Build per-day entries for the release range using the agent's roster/break rows */
function buildWeeks(
  releaseRange: { from: string; to: string },
  rosterRow: RosterRow | null,
  breakRow: BreakRow | null,
  overrideMap: Record<string, OverrideEntry> = {},
): WeekEntry[] {
  const start = parseDateLocal(releaseRange.from)
  const end   = parseDateLocal(releaseRange.to)
  const allDays: DayEntry[] = []

  let cur = new Date(start)
  while (cur <= end) {
    const wfmDay   = WFM_DAYS[JS_TO_WFM_IDX[cur.getDay()]]
    const dateKey  = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
    const override = overrideMap[dateKey]

    let shiftStr: string
    let isOff: boolean
    if (override) {
      isOff    = override.isOff
      shiftStr = override.isOff ? 'OFF' : (override.shiftStart && override.shiftEnd ? `${override.shiftStart}-${override.shiftEnd}` : '')
    } else {
      shiftStr = rosterRow?.[wfmDay] ?? ''
      isOff    = !shiftStr || shiftStr === 'OFF'
    }

    // Shift breaks by the same offset as the shift start change
    const originalShiftStr  = rosterRow?.[wfmDay] ?? ''
    const originalStart     = originalShiftStr && originalShiftStr !== 'OFF' ? originalShiftStr.split('-')[0] : null
    const overrideStart     = override && !override.isOff ? override.shiftStart : null
    const breakOffsetMin    = (originalStart && overrideStart)
      ? timeToMin(overrideStart) - timeToMin(originalStart)
      : 0

    allDays.push({
      day:    wfmDay,
      date:   cur.getDate(),
      month:  cur.getMonth(),
      year:   cur.getFullYear(),
      shift:  isOff ? 'OFF' : shiftStr,
      break1: shiftBreak(breakRow?.[`${wfmDay}_Break_1`] ?? '', breakOffsetMin),
      lunch:  shiftBreak(breakRow?.[`${wfmDay}_Lunch`]   ?? '', breakOffsetMin),
      break2: shiftBreak(breakRow?.[`${wfmDay}_Break_2`] ?? '', breakOffsetMin),
      off:    isOff,
    })
    const next = new Date(cur)
    next.setDate(cur.getDate() + 1)
    cur = next
  }

  // Group into chunks of 7 days for the week navigator
  const weeks: WeekEntry[] = []
  for (let i = 0; i < allDays.length; i += 7) {
    const chunk = allDays.slice(i, i + 7)
    const first = chunk[0]
    const last  = chunk[chunk.length - 1]
    weeks.push({
      weekLabel: `${SHORT_MONTHS[first.month]} ${first.date} – ${SHORT_MONTHS[last.month]} ${last.date}, ${last.year}`,
      days: chunk,
    })
  }
  return weeks
}

// Extended day info stored in the calendar map
interface CalendarDayInfo {
  off: boolean
  shift?: string
  break1?: string
  lunch?: string
  break2?: string
  wfmDay?: string   // 'Mon' / 'Tue' etc. — for display
  fullDate?: Date
}

/** Build a date-keyed map for the mini calendar (includes breaks for detail panel) */
function buildDateMapFromStore(
  releaseRange: { from: string; to: string } | null,
  rosterRow: RosterRow | null,
  breakRow: BreakRow | null,
  overrideMap: Record<string, OverrideEntry> = {},
): Record<string, CalendarDayInfo> {
  if (!releaseRange) return {}
  const map: Record<string, CalendarDayInfo> = {}
  const start = parseDateLocal(releaseRange.from)
  const end   = parseDateLocal(releaseRange.to)
  let cur = new Date(start)
  while (cur <= end) {
    const wfmDay   = WFM_DAYS[JS_TO_WFM_IDX[cur.getDay()]]
    const dateKey  = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
    const override = overrideMap[dateKey]

    let shiftStr: string
    let isOff: boolean
    if (override) {
      isOff    = override.isOff
      shiftStr = override.isOff ? 'OFF' : (override.shiftStart && override.shiftEnd ? `${override.shiftStart}-${override.shiftEnd}` : '')
    } else {
      shiftStr = rosterRow?.[wfmDay] ?? ''
      isOff    = !shiftStr || shiftStr === 'OFF'
    }

    const key = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`
    map[key] = {
      off:      isOff,
      shift:    isOff ? 'OFF' : shiftStr,
      break1:   breakRow?.[`${wfmDay}_Break_1`] ?? '',
      lunch:    breakRow?.[`${wfmDay}_Lunch`]   ?? '',
      break2:   breakRow?.[`${wfmDay}_Break_2`] ?? '',
      wfmDay,
      fullDate: new Date(cur),
    }
    const next = new Date(cur)
    next.setDate(cur.getDate() + 1)
    cur = next
  }
  return map
}

// ─── Mini calendar (month view) with clickable day detail ────────────────────
function MiniCalendar({ dateMap }: { dateMap: Record<string, CalendarDayInfo> }) {
  const today = new Date()
  const [viewYear,    setViewYear]    = useState(today.getFullYear())
  const [viewMonth,   setViewMonth]   = useState(today.getMonth())
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedInfo = selectedKey ? dateMap[selectedKey] : null

  return (
    <div className="space-y-3">
      <div className="card p-5">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-bold text-gray-900">
            {FULL_MONTHS[viewMonth]} {viewYear}
          </h3>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={i} />
            const key     = `${viewYear}-${viewMonth}-${date}`
            const info    = dateMap[key]
            const isToday = date === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
            const isSel   = selectedKey === key
            const isClickable = !!info  // only scheduled days are clickable

            let cellClass  = 'rounded-lg text-xs flex flex-col items-center justify-center p-1.5 min-h-[40px] transition-all '
            let dateClass  = 'text-xs font-semibold '
            let labelClass = 'text-[9px] mt-0.5 '

            if (isClickable) cellClass += 'cursor-pointer '

            if (isSel) {
              cellClass  += info?.off
                ? 'bg-gray-200 ring-2 ring-gray-400 '
                : 'bg-brand-100 ring-2 ring-brand-500 shadow-sm '
            } else if (isToday) {
              cellClass += 'ring-2 ring-brand-400 '
            }

            if (info) {
              if (info.off) {
                if (!isSel) cellClass += 'bg-gray-100 hover:bg-gray-200 '
                dateClass  += 'text-gray-400'
                labelClass += 'text-gray-400'
              } else {
                if (!isSel) cellClass += 'bg-brand-50 border border-brand-200 hover:bg-brand-100 '
                dateClass  += 'text-brand-700'
                labelClass += 'text-brand-500'
              }
            } else {
              cellClass  += 'bg-white'
              dateClass  += 'text-gray-400'
            }

            return (
              <div
                key={i}
                className={cellClass}
                onClick={() => isClickable ? setSelectedKey(isSel ? null : key) : null}
              >
                <span className={dateClass}>{date}</span>
                {info && <span className={labelClass}>{info.off ? 'OFF' : 'Work'}</span>}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-brand-100 border border-brand-300" />
            <span className="text-[10px] text-gray-500">Working</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-gray-100" />
            <span className="text-[10px] text-gray-500">Day Off</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded ring-2 ring-brand-400 bg-white" />
            <span className="text-[10px] text-gray-500">Today</span>
          </div>
          <span className="text-[10px] text-gray-400 ml-auto">Tap a day to see details</span>
        </div>
      </div>

      {/* ── Day detail panel ── */}
      <AnimatePresence>
        {selectedInfo && selectedKey && (
          <motion.div
            key={selectedKey}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="card p-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900">
                  {selectedInfo.wfmDay}
                </h3>
                <p className="text-xs text-gray-400">
                  {selectedInfo.fullDate
                    ? `${SHORT_MONTHS[selectedInfo.fullDate.getMonth()]} ${selectedInfo.fullDate.getDate()}, ${selectedInfo.fullDate.getFullYear()}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedInfo.off
                  ? <span className="badge bg-gray-100 text-gray-500 border border-gray-200 text-xs font-semibold px-2.5 py-1 rounded-lg">Day Off</span>
                  : <span className="badge-green">Working</span>
                }
                <button
                  onClick={() => setSelectedKey(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>

            {selectedInfo.off ? (
              <div className="flex items-center justify-center py-6 text-gray-400">
                <Sun className="w-5 h-5 mr-2" />
                <span className="text-sm">Enjoy your day off!</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <ShiftCard
                  icon={<Clock className="w-4 h-4 text-sky-600" />}
                  bg="bg-sky-50 border-sky-100" iconBg="bg-sky-100"
                  label="Shift" value={selectedInfo.shift || '—'}
                />
                <ShiftCard
                  icon={<Utensils className="w-4 h-4 text-emerald-600" />}
                  bg="bg-emerald-50 border-emerald-100" iconBg="bg-emerald-100"
                  label="Lunch" value={selectedInfo.lunch || '—'}
                />
                <ShiftCard
                  icon={<Coffee className="w-4 h-4 text-amber-600" />}
                  bg="bg-amber-50 border-amber-100" iconBg="bg-amber-100"
                  label="Break 1" value={selectedInfo.break1 || '—'}
                />
                <ShiftCard
                  icon={<Coffee className="w-4 h-4 text-amber-600" />}
                  bg="bg-amber-50 border-amber-100" iconBg="bg-amber-100"
                  label="Break 2" value={selectedInfo.break2 || '—'}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AgentPortal() {
  const [loggedIn,     setLoggedIn]     = useState(false)
  const [agentName,    setAgentName]    = useState('')
  const [agentCode,    setAgentCode]    = useState('')
  const [agentDbId,    setAgentDbId]    = useState('')
  const [activeTab,    setActiveTab]    = useState<'week' | 'calendar' | 'leave'>('week')

  // Leave state
  const [leaveBalances,  setLeaveBalances]  = useState<LeaveBalance[]>([])
  const [leaveRequests,  setLeaveRequests]  = useState<LeaveRequest[]>([])
  const [leaveLoading,   setLeaveLoading]   = useState(false)
  const [showLeaveForm,  setShowLeaveForm]  = useState(false)

  // Leave form
  const [lStartDate,   setLStartDate]   = useState('')
  const [lEndDate,     setLEndDate]     = useState('')
  const [lLeaveType,   setLLeaveType]   = useState<LeaveType>('Annual')
  const [lDuration,    setLDuration]    = useState<'full_day' | 'half_day_am' | 'half_day_pm'>('full_day')
  const [lNotes,       setLNotes]       = useState('')
  const [lSubmitting,  setLSubmitting]  = useState(false)

  // Login form state
  const [empId,        setEmpId]        = useState('')
  const [password,     setPassword]     = useState('')
  const [showPw,       setShowPw]       = useState(false)
  const [loginError,   setLoginError]   = useState('')
  const [isLoggingIn,  setIsLoggingIn]  = useState(false)

  const [portalData, setPortalData] = useState<PortalData | null>(null)

  async function loadLeaveData(agId: string) {
    setLeaveLoading(true)
    try {
      const year = new Date().getFullYear()
      const [balRes, reqRes] = await Promise.all([
        axios.get(`${PORTAL_API}/leave/balances/${agId}?year=${year}`),
        axios.get(`${PORTAL_API}/leave/requests/${agId}`),
      ])
      setLeaveBalances(balRes.data)
      setLeaveRequests(reqRes.data)
    } catch {
      // silently fail if no leave data available
    } finally {
      setLeaveLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    if (!empId.trim()) { setLoginError('Employee ID is required.'); return }

    setIsLoggingIn(true)
    try {
      // Step 1: Verify agent code + password against backend
      const loginRes = await axios.post(`${PORTAL_API}/login`, {
        agentCode: empId.trim(),
        password: password || undefined,
      })
      const { agent } = loginRes.data

      // Step 2: Fetch the released schedule for this agent
      const schedRes = await axios.get(`${PORTAL_API}/schedule/${agent.agentCode}`)
      const data: PortalData = {
        released:     schedRes.data.released ?? false,
        releaseRange: schedRes.data.releaseRange ?? null,
        rosterRow:    schedRes.data.rosterRow ?? null,
        breakRow:     schedRes.data.breakRow ?? null,
        overrideMap:  schedRes.data.overrideMap ?? {},
      }
      setPortalData(data)
      setLoggedIn(true)
      setAgentName(agent.name)
      setAgentCode(agent.agentCode)
      setAgentDbId(agent.id ?? '')
      if (agent.id) loadLeaveData(agent.id)
      toast.success(`Welcome back, ${agent.name.split(' ')[0]}!`)
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.error
          ? (err.response.data.error as string)
          : 'Login failed. Please try again.'
      setLoginError(msg)
    } finally {
      setIsLoggingIn(false)
    }
  }

  // Refresh leave when tab is opened
  useEffect(() => {
    if (activeTab === 'leave' && agentDbId) {
      loadLeaveData(agentDbId)
    }
  }, [activeTab, agentDbId])

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault()
    if (!lStartDate) { toast.error('Select a start date.'); return }
    if (!lEndDate)   setLEndDate(lStartDate)

    setLSubmitting(true)
    try {
      // Compute hours: full_day = 8h, half = 4h, per day
      const start    = new Date(lStartDate)
      const end      = new Date(lEndDate || lStartDate)
      const days     = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
      const hrsPerDay = lDuration === 'full_day' ? 8 : 4
      const totalHours = days * hrsPerDay

      await axios.post(`${PORTAL_API}/leave/requests`, {
        agentId:      agentDbId,
        leaveType:    lLeaveType,
        startDate:    lStartDate,
        endDate:      lEndDate || lStartDate,
        durationType: lDuration,
        totalHours,
        notes:        lNotes || undefined,
      })
      toast.success('Leave request submitted!')
      setShowLeaveForm(false)
      setLStartDate(''); setLEndDate(''); setLNotes('')
      loadLeaveData(agentDbId)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) && err.response?.data?.error
        ? (err.response.data.error as string)
        : 'Failed to submit leave request.'
      toast.error(msg)
    } finally {
      setLSubmitting(false)
    }
  }

  // ── Resolve this agent's roster & break rows from API data ───────────────────
  const released     = portalData?.released    ?? false
  const releaseRange = portalData?.releaseRange ?? null
  const myRosterRow: RosterRow | null = portalData?.rosterRow ?? null
  const myBreakRow:  BreakRow  | null = portalData?.breakRow  ?? null
  const overrideMap  = portalData?.overrideMap ?? {}

  // ── Build schedule weeks from release range ──────────────────────────────────
  const hasRealSchedule = released && releaseRange && myRosterRow != null
  const weeks: WeekEntry[] = hasRealSchedule
    ? buildWeeks(releaseRange!, myRosterRow, myBreakRow, overrideMap)
    : []

  const dateMap = buildDateMapFromStore(releaseRange, myRosterRow, myBreakRow, overrideMap)

  // ── Login screen ─────────────────────────────────────────────────────────────
  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 shadow-lg mb-4">
              <CalendarDays className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
            <p className="text-gray-500 text-sm mt-1">WFM Club · Agent Portal</p>
          </div>

          {/* Login card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-7">
            <p className="text-gray-600 text-sm text-center mb-6">
              Sign in with your <strong>Employee ID</strong> and password to view your schedule.
            </p>

            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              {/* Employee ID */}
              <div>
                <label className="label">Employee ID</label>
                <input
                  className="input font-mono"
                  placeholder="e.g. AG001"
                  value={empId}
                  onChange={e => { setEmpId(e.target.value); setLoginError('') }}
                  autoComplete="username"
                  autoFocus
                />
              </div>

              {/* Password */}
              <div>
                <label className="label flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-gray-400" />
                  Password
                </label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPw ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setLoginError('') }}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error message */}
              <AnimatePresence>
                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"
                  >
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600">{loginError}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500
                           disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold
                           rounded-xl py-3 text-sm transition-all shadow-glow-sm mt-2"
              >
                {isLoggingIn ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                ) : null}
                {isLoggingIn ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <p className="text-center text-[11px] text-gray-400 mt-5">
              Forgot your password? Contact your WFM manager.
            </p>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Schedules not released ────────────────────────────────────────────────────
  if (!released) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PortalHeader agentName={agentName} onSignOut={() => setLoggedIn(false)} />
        <main className="max-w-2xl mx-auto p-8 flex flex-col items-center justify-center min-h-[60vh]">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center w-full">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-50 mb-5">
              <Info className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Schedules Not Available</h2>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Your schedule has not been released yet. Please check back later or contact your manager for more information.
            </p>
          </div>
        </main>
      </div>
    )
  }

  // ── Main portal ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader agentName={agentName} agentCode={agentCode} onSignOut={() => setLoggedIn(false)} />

      <main className="max-w-3xl mx-auto p-6 space-y-5">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {([['week', 'Weekly View'], ['calendar', 'Calendar'], ['leave', 'Leave']] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── CALENDAR TAB ── */}
        {activeTab === 'calendar' && <MiniCalendar dateMap={dateMap} />}

        {/* ── LEAVE TAB ── */}
        {activeTab === 'leave' && (
          <div className="space-y-5">

            {/* Balance cards */}
            <div className="grid grid-cols-2 gap-3">
              {LEAVE_TYPES.map(lt => {
                const bal = leaveBalances.find(b => b.leaveType === lt)
                const remaining = bal ? bal.totalHours - bal.usedHours : 0
                const total     = bal?.totalHours ?? 0
                const pct       = total > 0 ? (remaining / total) * 100 : 0
                return (
                  <div key={lt} className="card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{lt}</span>
                      <CalendarOff className="w-4 h-4 text-gray-300" />
                    </div>
                    <p className="text-xl font-bold text-gray-900">{remaining}h</p>
                    <p className="text-xs text-gray-400 mt-0.5">of {total}h remaining</p>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Apply for leave button */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Leave History</h3>
              {!showLeaveForm && (
                <button
                  onClick={() => setShowLeaveForm(true)}
                  className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold
                             rounded-xl px-3 py-2 text-sm transition-all shadow-glow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Apply for Leave
                </button>
              )}
            </div>

            {/* Leave application form */}
            <AnimatePresence>
              {showLeaveForm && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  className="card p-5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-gray-900 text-sm">Apply for Leave</h4>
                    <button onClick={() => setShowLeaveForm(false)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <form onSubmit={submitLeave} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Start Date</label>
                        <input type="date" className="input" value={lStartDate}
                          onChange={e => { setLStartDate(e.target.value); if (!lEndDate) setLEndDate(e.target.value) }} required />
                      </div>
                      <div>
                        <label className="label">End Date</label>
                        <input type="date" className="input" value={lEndDate} min={lStartDate}
                          onChange={e => setLEndDate(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Leave Type</label>
                        <select className="input" value={lLeaveType} onChange={e => setLLeaveType(e.target.value as LeaveType)}>
                          {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Duration</label>
                        <select className="input" value={lDuration} onChange={e => setLDuration(e.target.value as typeof lDuration)}>
                          <option value="full_day">Full Day</option>
                          <option value="half_day_am">Half Day (AM)</option>
                          <option value="half_day_pm">Half Day (PM)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label">Notes (optional)</label>
                      <textarea className="input resize-none" rows={2} value={lNotes}
                        onChange={e => setLNotes(e.target.value)} placeholder="Reason for leave…" />
                    </div>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setShowLeaveForm(false)}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50">
                        Cancel
                      </button>
                      <button type="submit" disabled={lSubmitting}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-500
                                   text-white transition-all disabled:opacity-50">
                        {lSubmitting ? 'Submitting…' : 'Submit Request'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Leave history table */}
            {leaveLoading ? (
              <div className="text-center text-gray-400 py-6 text-sm">Loading leave history…</div>
            ) : leaveRequests.length === 0 ? (
              <div className="card p-8 text-center">
                <CalendarOff className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No leave requests yet.</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <table className="wfm-table w-full">
                  <thead>
                    <tr>
                      <th className="text-left">Dates</th>
                      <th className="text-center">Type</th>
                      <th className="text-center">Hours</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRequests.map(r => (
                      <tr key={r.id}>
                        <td className="text-xs text-gray-700">
                          {fmtDate(r.startDate)}
                          {r.startDate !== r.endDate && ` → ${fmtDate(r.endDate)}`}
                          <div className="text-gray-400 mt-0.5 capitalize">{r.durationType.replace(/_/g, ' ')}</div>
                        </td>
                        <td className="text-center">
                          <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-brand-50 text-brand-700">
                            {r.leaveType}
                          </span>
                        </td>
                        <td className="text-center font-semibold text-gray-700 text-sm">{r.totalHours}h</td>
                        <td className="text-center">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${STATUS_COLORS[r.status] ?? ''}`}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── WEEKLY VIEW TAB ── */}
        {activeTab === 'week' && (
          <>
            {weeks.length === 0 ? (
              <div className="card p-10 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 mb-4">
                  <CalendarDays className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-sm font-semibold text-gray-600">No schedule data found.</p>
                <p className="text-xs text-gray-400 mt-1">Ask your manager to generate and release a roster.</p>
              </div>
            ) : (
              <>
                {/* Summary header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 font-medium">{agentCode} · {agentName}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {weeks.length} week{weeks.length !== 1 ? 's' : ''} · {weeks.flatMap(w => w.days).length} days
                    </p>
                  </div>
                  <span className="badge-green">Published</span>
                </div>

                {/* All weeks rendered as continuous scroll */}
                {weeks.map((week, wi) => {
                  const allDays = week.days
                  const globalOffset = wi * 7
                  return (
                    <div key={week.weekLabel} className="space-y-3">
                      {/* Week section header */}
                      <div className="card p-4">
                        <h2 className="text-sm font-bold text-gray-700 mb-3">{week.weekLabel}</h2>
                        {/* Mini 7-day strip */}
                        <div className="grid grid-cols-7 gap-1.5">
                          {allDays.map((d) => (
                            <div
                              key={`${d.day}-${d.date}`}
                              className={`flex flex-col items-center gap-1 rounded-xl p-2 border ${
                                d.off
                                  ? 'bg-gray-50 border-gray-200 opacity-60'
                                  : 'bg-brand-50 border-brand-200'
                              }`}
                            >
                              <span className="text-[10px] text-gray-500 font-semibold">{d.day}</span>
                              <span className="text-[10px] font-bold text-gray-600">{d.date}</span>
                              {d.off
                                ? <span className="text-[9px] text-gray-400 font-bold">OFF</span>
                                : <Sun className="w-3 h-3 text-brand-500 mt-0.5" />
                              }
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Day detail cards */}
                      {allDays.map((d, i) => (
                        <motion.div
                          key={`${wi}-${d.day}-${d.date}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: (globalOffset + i) * 0.03 }}
                          className={`card p-5 ${d.off ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="font-bold text-gray-900">{d.day}</h3>
                              <p className="text-xs text-gray-400">
                                {SHORT_MONTHS[d.month]} {d.date}, {d.year}
                              </p>
                            </div>
                            {d.off
                              ? <span className="badge bg-gray-100 text-gray-500 border border-gray-200 text-xs font-semibold px-2.5 py-1 rounded-lg">Day Off</span>
                              : <span className="badge-green">Working</span>
                            }
                          </div>

                          {d.off ? (
                            <div className="flex items-center gap-2 text-gray-400 py-2">
                              <Sun className="w-4 h-4" />
                              <span className="text-sm">Enjoy your day off!</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-3">
                              <ShiftCard icon={<Clock className="w-4 h-4 text-sky-600" />}
                                bg="bg-sky-50 border-sky-100" iconBg="bg-sky-100"
                                label="Shift" value={d.shift} />
                              <ShiftCard icon={<Utensils className="w-4 h-4 text-emerald-600" />}
                                bg="bg-emerald-50 border-emerald-100" iconBg="bg-emerald-100"
                                label="Lunch" value={d.lunch || '—'} />
                              <ShiftCard icon={<Coffee className="w-4 h-4 text-amber-600" />}
                                bg="bg-amber-50 border-amber-100" iconBg="bg-amber-100"
                                label="Break 1" value={d.break1 || '—'} />
                              <ShiftCard icon={<Coffee className="w-4 h-4 text-amber-600" />}
                                bg="bg-amber-50 border-amber-100" iconBg="bg-amber-100"
                                label="Break 2" value={d.break2 || '—'} />
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PortalHeader({ agentName, agentCode, onSignOut }: {
  agentName: string
  agentCode?: string
  onSignOut: () => void
}) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <CalendarDays className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-none">My Schedule</p>
          <p className="text-[10px] text-gray-500">WFM Club</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600 font-medium">{agentName}</span>
        {agentCode && <span className="text-xs text-gray-400 font-mono">{agentCode}</span>}
        <button
          onClick={onSignOut}
          className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}

function ShiftCard({ icon, bg, iconBg, label, value }: {
  icon: React.ReactNode
  bg: string
  iconBg: string
  label: string
  value: string
}) {
  return (
    <div className={`flex items-center gap-3 ${bg} border rounded-xl p-3`}>
      <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-sm font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}

