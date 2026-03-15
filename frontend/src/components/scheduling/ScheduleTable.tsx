import { useState } from 'react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { RosterRow, BreakRow } from '../../types'
import { WEEKDAYS } from '../../types'
import { useAgentStore } from '../../store/agentStore'
import { useScheduleStore } from '../../store/scheduleStore'
import { minToTime, timeToMin } from '../../utils/scheduleEngine'

interface Props {
  rosterRows: RosterRow[]
  breakRows: BreakRow[]
  onModify: (agentId: string) => void
}

type Tab = 'roster' | 'breaks'

const SHIFT_MIN = 9 * 60

export default function ScheduleTable({ rosterRows, breakRows, onModify }: Props) {
  const [tab, setTab] = useState<Tab>('roster')
  const [searchTerm, setSearchTerm] = useState('')
  // editingCell: { slot, col } where col is 'shift' (global) or a weekday like 'Mon'
  const [editingCell, setEditingCell] = useState<{ slot: string; col: string } | null>(null)

  const { agents: realAgents } = useAgentStore()
  const {
    agentAssignments,
    assignAgent,
    unassignAgent,
    agents: slotAgents,
    updateAgentShift,
    updateRosterCell,
    settings,
  } = useScheduleStore()

  // Available shift options from settings window
  const minStart = timeToMin(settings.earliestShiftStart) ?? 0
  const maxStart = timeToMin(settings.latestShiftStart) ?? 23 * 60
  const shiftOptions: { start: number; end: number }[] = []
  for (let s = minStart; s <= maxStart; s += 30) {
    shiftOptions.push({ start: s, end: s + SHIFT_MIN })
  }

  const filteredRoster = rosterRows.filter((r) =>
    r.agent.toLowerCase().includes(searchTerm.toLowerCase()),
  )
  const filteredBreaks = breakRows.filter((r) =>
    r.agent.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  // Handle agent assignment from roster table
  function handleAssign(slotId: string, newRealAgentId: string) {
    // Unassign previous real agent from this slot
    if (agentAssignments[slotId]) unassignAgent(slotId)
    if (!newRealAgentId) return
    // Unassign this real agent from any other slot they were in
    const prevSlot = Object.entries(agentAssignments).find(([, v]) => v === newRealAgentId)?.[0]
    if (prevSlot) unassignAgent(prevSlot)
    assignAgent(slotId, newRealAgentId)
  }

  // Handle global shift change (Shift column)
  function handleShiftChange(slotId: string, newStart: number) {
    const newEnd = newStart + SHIFT_MIN
    updateAgentShift(slotId, newStart, newEnd)
    setEditingCell(null)
    toast.success(`Shift updated → ${minToTime(newStart)}–${minToTime(newEnd)}`)
  }

  // Handle per-day cell change (individual weekday column)
  function handleCellChange(slotId: string, weekday: string, value: string) {
    updateRosterCell(slotId, weekday, value)
    setEditingCell(null)
    toast.success(value === 'OFF'
      ? `${slotId} · ${weekday} set to OFF`
      : `${slotId} · ${weekday} shift → ${value}`)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-gray-200">
        <div className="flex gap-1">
          {(['roster', 'breaks'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'px-4 py-2 rounded-xl text-sm font-semibold transition-all capitalize',
                tab === t
                  ? 'bg-brand-50 text-brand-700 border border-brand-200'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <input
            className="input w-44 text-xs py-2"
            placeholder="Filter agents…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span className="text-xs text-gray-400">
            {tab === 'roster' ? filteredRoster.length : filteredBreaks.length} agents
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
        {tab === 'roster' ? (
          <table className="wfm-table w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="text-left sticky left-0 bg-gray-50 z-20">Slot</th>
                <th className="text-left">Assigned Agent</th>
                <th className="text-center">Shift</th>
                <th className="text-center">Off Days</th>
                {WEEKDAYS.map((d) => (
                  <th key={d} className="text-center">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRoster.map((row) => {
                const slotAgent = slotAgents.find((a) => a.id === row.agent)
                const currentStart = slotAgent?.start ?? 0
                return (
                  <tr key={row.agent} className="group">
                    {/* Slot ID */}
                    <td
                      className="sticky left-0 bg-white font-semibold text-brand-600 whitespace-nowrap cursor-pointer hover:text-brand-800"
                      onClick={() => onModify(row.agent)}
                    >
                      {row.agent}
                    </td>

                    {/* Agent assignment dropdown */}
                    <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <select
                        className="input text-xs py-1 w-44"
                        value={agentAssignments[row.agent] ?? ''}
                        onChange={(e) => handleAssign(row.agent, e.target.value)}
                      >
                        <option value="">— Unassigned —</option>
                        {realAgents.map((a) => {
                          const takenByOther = Object.entries(agentAssignments).some(
                            ([slotId, agId]) => agId === a.id && slotId !== row.agent,
                          )
                          return (
                            <option key={a.id} value={a.id} disabled={takenByOther}>
                              {a.name}
                              {takenByOther ? ' (assigned)' : ''}
                            </option>
                          )
                        })}
                      </select>
                    </td>

                    {/* Shift time – click to change (all working days at once) */}
                    <td
                      className="text-center font-mono whitespace-nowrap"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingCell({ slot: row.agent, col: 'shift' })
                      }}
                    >
                      {editingCell?.slot === row.agent && editingCell.col === 'shift' ? (
                        <select
                          autoFocus
                          className="input text-xs py-1 w-32"
                          value={currentStart}
                          onChange={(e) => handleShiftChange(row.agent, parseInt(e.target.value))}
                          onBlur={() => setEditingCell(null)}
                        >
                          {shiftOptions.map((opt) => (
                            <option key={opt.start} value={opt.start}>
                              {minToTime(opt.start)}–{minToTime(opt.end)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="cursor-pointer hover:text-brand-600 hover:underline"
                          title="Click to change shift for all working days"
                        >
                          {row.shiftStart}–{row.shiftEnd}
                        </span>
                      )}
                    </td>

                    {/* Off Days */}
                    <td className="text-center text-gray-500">{row.offDays}</td>

                    {/* Per-day schedule cells – click to edit individual day */}
                    {WEEKDAYS.map((d) => {
                      const cellVal = row[d as keyof typeof row] as string
                      const isEditing = editingCell?.slot === row.agent && editingCell.col === d
                      return (
                        <td
                          key={d}
                          className={clsx(
                            'text-center font-mono whitespace-nowrap cursor-pointer',
                            cellVal === 'OFF'
                              ? 'text-gray-300 hover:text-gray-500'
                              : 'text-gray-800 hover:text-brand-600',
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingCell({ slot: row.agent, col: d })
                          }}
                          title="Click to edit this day's shift"
                        >
                          {isEditing ? (
                            <select
                              autoFocus
                              className="input text-xs py-0.5 w-28"
                              value={cellVal === 'OFF' ? 'OFF' : cellVal}
                              onChange={(e) => handleCellChange(row.agent, d, e.target.value)}
                              onBlur={() => setEditingCell(null)}
                            >
                              <option value="OFF">— OFF —</option>
                              {shiftOptions.map((opt) => {
                                const label = `${minToTime(opt.start)}–${minToTime(opt.end)}`
                                return (
                                  <option key={opt.start} value={label}>
                                    {label}
                                  </option>
                                )
                              })}
                            </select>
                          ) : (
                            <span>{cellVal}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {filteredRoster.length === 0 && (
                <tr>
                  <td colSpan={4 + WEEKDAYS.length} className="text-center text-gray-400 py-6 text-sm">
                    No agents match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          /* Breaks table */
          <table className="wfm-table w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="text-left sticky left-0 bg-gray-50 z-20">Slot / Agent</th>
                {WEEKDAYS.map((d) => (
                  <>
                    <th key={`${d}_b1`} className="text-center">{d} Brk1</th>
                    <th key={`${d}_lunch`} className="text-center">{d} Lunch</th>
                    <th key={`${d}_b2`} className="text-center">{d} Brk2</th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredBreaks.map((row) => {
                const realAgent = agentAssignments[row.agent]
                  ? realAgents.find((a) => a.id === agentAssignments[row.agent])
                  : null
                return (
                  <tr key={row.agent}>
                    <td className="sticky left-0 bg-white whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-brand-600">{row.agent}</span>
                        {realAgent && (
                          <span className="text-gray-600 font-medium text-[10px]">{realAgent.name}</span>
                        )}
                      </div>
                    </td>
                    {WEEKDAYS.map((d) => (
                      <>
                        <td key={`${d}_b1`} className="text-center font-mono text-amber-600 whitespace-nowrap">
                          {row[`${d}_Break_1`] || '—'}
                        </td>
                        <td key={`${d}_lunch`} className="text-center font-mono text-emerald-600 whitespace-nowrap">
                          {row[`${d}_Lunch`] || '—'}
                        </td>
                        <td key={`${d}_b2`} className="text-center font-mono text-amber-600 whitespace-nowrap">
                          {row[`${d}_Break_2`] || '—'}
                        </td>
                      </>
                    ))}
                  </tr>
                )
              })}
              {filteredBreaks.length === 0 && (
                <tr>
                  <td colSpan={1 + WEEKDAYS.length * 3} className="text-center text-gray-400 py-6 text-sm">
                    No agents match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
