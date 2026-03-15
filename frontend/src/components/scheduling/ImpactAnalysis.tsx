import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, BarChart2, X } from 'lucide-react'
import type { ScheduledAgent, ForecastRow, StaffingRow, ScheduleSettings, Weekday } from '../../types'
import { WEEKDAYS } from '../../types'
import { minToTime, buildScheduledCounts, timeToMin } from '../../utils/scheduleEngine'
import { erlangAEstimates } from '../../utils/erlang'
import { useAgentStore } from '../../store/agentStore'
import { useScheduleStore } from '../../store/scheduleStore'

// An override changes a specific agent's shift on a specific day
interface Override {
  agentId: string
  weekday: Weekday
  // null = OFF, otherwise new shift window
  newShift: { start: number; end: number } | null
}

interface Props {
  agents: ScheduledAgent[]
  forecastRows: ForecastRow[]
  requiredStaff: StaffingRow[]
  settings: ScheduleSettings
  allSlots: number[]
}

const SHIFT_MIN = 9 * 60

export default function ImpactAnalysis({ agents, forecastRows, settings, allSlots }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [overrides, setOverrides] = useState<Override[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedDay, setSelectedDay] = useState<Weekday>('Mon')
  // newShiftStart: number (minutes) or 'OFF'
  const [newShiftStart, setNewShiftStart] = useState<string>('OFF')

  const { agents: realAgents } = useAgentStore()
  const { agentAssignments } = useScheduleStore()

  // Available shift options from settings window
  const minStart = timeToMin(settings.earliestShiftStart) ?? 0
  const maxStart = timeToMin(settings.latestShiftStart) ?? 23 * 60
  const shiftOptions: { start: number; end: number }[] = []
  for (let s = minStart; s <= maxStart; s += 30) {
    shiftOptions.push({ start: s, end: s + SHIFT_MIN })
  }

  // Actual scheduled counts as baseline (what the roster currently delivers)
  const actualCounts = useMemo(
    () => buildScheduledCounts(agents, allSlots),
    [agents, allSlots],
  )

  // After = actual counts with overrides applied
  const afterCounts = useMemo(() => {
    // deep copy
    const counts: Record<string, Record<string, number>> = {}
    for (const wd of WEEKDAYS) counts[wd] = { ...actualCounts[wd] }

    for (const ov of overrides) {
      const agent = agents.find((a) => a.id === ov.agentId)
      if (!agent) continue

      // Remove old contribution if agent was working on this day
      const wasWorking = !agent.off.includes(ov.weekday)
      if (wasWorking) {
        for (const t of allSlots) {
          if (t >= agent.start && t < agent.start + SHIFT_MIN) {
            const lbl = minToTime(t)
            counts[ov.weekday][lbl] = Math.max(0, (counts[ov.weekday][lbl] ?? 0) - 1)
          }
        }
      }

      // Add new shift contribution (null = OFF, nothing to add)
      if (ov.newShift !== null) {
        for (const t of allSlots) {
          if (t >= ov.newShift.start && t < ov.newShift.start + SHIFT_MIN) {
            const lbl = minToTime(t)
            counts[ov.weekday][lbl] = (counts[ov.weekday][lbl] ?? 0) + 1
          }
        }
      }
    }
    return counts
  }, [actualCounts, overrides, agents, allSlots])

  // SLA impact rows
  const intervalLen = settings.intervalFormat === '15 minutes' ? 15 : 30
  const impactRows = useMemo(() => {
    const mu = 1 / (settings.ahtSeconds / 60)
    const theta = 1 / (settings.patienceSeconds / 60)
    const tSla = settings.slaThresholdSeconds / 60
    const rows: {
      day: Weekday; beforeSLA: number; afterSLA: number; deltaSLA: number
      beforeAbn: number; afterAbn: number
    }[] = []

    for (const wd of WEEKDAYS) {
      let bSlaAcc = 0; let aSlaAcc = 0
      let bAbnAcc = 0; let aAbnAcc = 0
      let totCalls = 0

      for (const t of allSlots) {
        const lbl = minToTime(t)
        const row = forecastRows.find((r) => r.weekday === wd && r.slotMin === t)
        const calls = row?.volume ?? 0
        const bSched = actualCounts[wd]?.[lbl] ?? 0
        const aSched = afterCounts[wd]?.[lbl]  ?? 0
        const a = (calls / intervalLen) / mu

        const bEst = bSched > 0 ? erlangAEstimates(a, bSched, mu, theta, tSla) : { slaEst: 0, pAbandon: calls > 0 ? 1 : 0 }
        const aEst = aSched > 0 ? erlangAEstimates(a, aSched, mu, theta, tSla) : { slaEst: 0, pAbandon: calls > 0 ? 1 : 0 }

        bSlaAcc += bEst.slaEst * calls
        aSlaAcc += aEst.slaEst * calls
        bAbnAcc += bEst.pAbandon * calls
        aAbnAcc += aEst.pAbandon * calls
        totCalls += calls
      }

      const before    = totCalls > 0 ? (bSlaAcc / totCalls) * 100 : 0
      const after     = totCalls > 0 ? (aSlaAcc / totCalls) * 100 : 0
      const beforeAbn = totCalls > 0 ? (bAbnAcc / totCalls) * 100 : 0
      const afterAbn  = totCalls > 0 ? (aAbnAcc / totCalls) * 100 : 0
      rows.push({
        day: wd as Weekday,
        beforeSLA: +before.toFixed(2),
        afterSLA: +after.toFixed(2),
        deltaSLA: +(after - before).toFixed(2),
        beforeAbn: +beforeAbn.toFixed(2),
        afterAbn: +afterAbn.toFixed(2),
      })
    }
    return rows
  }, [actualCounts, afterCounts, forecastRows, allSlots, settings, intervalLen])

  // Default newShiftStart to selected agent's current shift when agent changes
  function handleAgentChange(id: string) {
    setSelectedAgent(id)
    const ag = agents.find((a) => a.id === id)
    if (ag) {
      setNewShiftStart(!ag.off.includes(selectedDay) ? String(ag.start) : 'OFF')
    }
  }

  function applyOverride() {
    if (!selectedAgent) return
    const shift = newShiftStart === 'OFF'
      ? null
      : { start: parseInt(newShiftStart), end: parseInt(newShiftStart) + SHIFT_MIN }
    setOverrides((prev) => [
      ...prev.filter((o) => !(o.agentId === selectedAgent && o.weekday === selectedDay)),
      { agentId: selectedAgent, weekday: selectedDay, newShift: shift },
    ])
  }

  const totalDeltaSLA = impactRows.reduce((s, r) => s + r.deltaSLA, 0)

  return (
    <div className="card">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between w-full p-5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-brand-600" />
            <span className="text-sm font-bold text-gray-900">Impact Analysis</span>
          </div>
          <span className="text-xs text-gray-500">Simulate shift changes and see SLA impact</span>
          {overrides.length > 0 && (
            <span className={`badge ${totalDeltaSLA >= 0 ? 'badge-green' : 'badge-red'}`}>
              {totalDeltaSLA >= 0 ? '+' : ''}{totalDeltaSLA.toFixed(2)}% SLA
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />
        }
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-5 border-t border-gray-200">

              {/* ── Override builder ─────────────────────────────── */}
              <div className="mt-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Simulate Change
                </p>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap gap-3 items-end">

                    {/* 1. Agent selector */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-gray-400 uppercase">Agent</label>
                      <select
                        className="input text-sm"
                        style={{ minWidth: '220px' }}
                        value={selectedAgent}
                        onChange={(e) => handleAgentChange(e.target.value)}
                      >
                        <option value="">Select agent…</option>
                        {agents.map((a) => {
                          const realAgent = agentAssignments[a.id]
                            ? realAgents.find((r) => r.id === agentAssignments[a.id])
                            : null
                          const label = realAgent
                            ? `${realAgent.name} (${a.id}) — ${minToTime(a.start)}–${minToTime(a.end)}`
                            : `${a.id} — ${minToTime(a.start)}–${minToTime(a.end)}`
                          return <option key={a.id} value={a.id}>{label}</option>
                        })}
                      </select>
                    </div>

                    {/* 2. Day selector */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-gray-400 uppercase">Day</label>
                      <select
                        className="input w-28"
                        value={selectedDay}
                        onChange={(e) => {
                          const day = e.target.value as Weekday
                          setSelectedDay(day)
                          // Auto-update shift preview for that day
                          const ag = agents.find((a) => a.id === selectedAgent)
                          if (ag) setNewShiftStart(!ag.off.includes(day) ? String(ag.start) : 'OFF')
                        }}
                      >
                        {WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>

                    {/* 3. New shift selector (all available shifts + OFF) */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-gray-400 uppercase">
                        Change shift to
                      </label>
                      <select
                        className="input w-44"
                        value={newShiftStart}
                        onChange={(e) => setNewShiftStart(e.target.value)}
                      >
                        <option value="OFF">OFF (day off)</option>
                        {shiftOptions.map((opt) => {
                          const ag = agents.find((a) => a.id === selectedAgent)
                          const isCurrent = ag && ag.start === opt.start && !ag.off.includes(selectedDay)
                          return (
                            <option key={opt.start} value={String(opt.start)}>
                              {minToTime(opt.start)}–{minToTime(opt.end)}
                              {isCurrent ? ' (current)' : ''}
                            </option>
                          )
                        })}
                      </select>
                    </div>

                    <button
                      onClick={applyOverride}
                      disabled={!selectedAgent}
                      className="self-end bg-brand-600 hover:bg-brand-700 disabled:bg-gray-200
                                 disabled:text-gray-400 text-white font-semibold rounded-xl
                                 px-4 py-2 text-sm transition-all"
                    >
                      Apply
                    </button>

                    {overrides.length > 0 && (
                      <button
                        onClick={() => setOverrides([])}
                        className="self-end text-sm text-red-500 hover:text-red-700 transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  {/* Applied override chips */}
                  {overrides.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {overrides.map((ov) => {
                        const ag = agents.find((a) => a.id === ov.agentId)
                        const realName = agentAssignments[ov.agentId]
                          ? realAgents.find((r) => r.id === agentAssignments[ov.agentId])?.name
                          : null
                        const shiftLabel = ov.newShift
                          ? `→ ${minToTime(ov.newShift.start)}–${minToTime(ov.newShift.end)}`
                          : '→ OFF'
                        return (
                          <span
                            key={`${ov.agentId}-${ov.weekday}`}
                            className="inline-flex items-center gap-1.5 text-xs bg-brand-50 text-brand-700
                                       border border-brand-200 rounded-lg px-2.5 py-1"
                          >
                            {realName ?? ov.agentId}
                            {ag ? ` (${minToTime(ag.start)}–${minToTime(ag.end)})` : ''}
                            {' '}{ov.weekday} {shiftLabel}
                            <button
                              onClick={() => setOverrides((p) =>
                                p.filter((x) => !(x.agentId === ov.agentId && x.weekday === ov.weekday))
                              )}
                              className="text-brand-400 hover:text-brand-700 ml-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Impact table ─────────────────────────────────── */}
              <div className="overflow-x-auto">
                <table className="wfm-table w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left">Day</th>
                      <th className="text-center">Before SLA</th>
                      <th className="text-center">After SLA</th>
                      <th className="text-center">SLA Delta</th>
                      <th className="text-center">Before Abn%</th>
                      <th className="text-center">After Abn%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impactRows.map((r) => (
                      <tr key={r.day}>
                        <td className="font-semibold text-gray-800">{r.day}</td>
                        <td className="text-center font-mono text-gray-600">{r.beforeSLA}%</td>
                        <td className={`text-center font-mono font-bold ${
                          r.afterSLA >= settings.slaTargetPct ? 'text-emerald-600' : 'text-amber-600'
                        }`}>{r.afterSLA}%</td>
                        <td className="text-center">
                          {r.deltaSLA === 0 ? (
                            <span className="flex items-center justify-center gap-1 text-gray-400">
                              <Minus className="w-3 h-3" /> 0%
                            </span>
                          ) : r.deltaSLA > 0 ? (
                            <span className="flex items-center justify-center gap-1 text-emerald-600 font-semibold">
                              <TrendingUp className="w-3 h-3" /> +{r.deltaSLA}%
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-1 text-red-500 font-semibold">
                              <TrendingDown className="w-3 h-3" /> {r.deltaSLA}%
                            </span>
                          )}
                        </td>
                        <td className="text-center font-mono text-gray-600">{r.beforeAbn}%</td>
                        <td className={`text-center font-mono ${
                          r.afterAbn < r.beforeAbn ? 'text-emerald-600'
                          : r.afterAbn > r.beforeAbn ? 'text-red-500'
                          : 'text-gray-600'
                        }`}>{r.afterAbn}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {overrides.length === 0 && (
                <p className="text-xs text-gray-400 text-center italic">
                  Select an agent, choose a day, pick a new shift (or OFF), then click Apply to preview the SLA impact.
                </p>
              )}

              <p className="text-xs text-gray-400">
                * Before SLA reflects the current generated roster. Changes show the impact of swapping an agent's shift on a specific day.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
