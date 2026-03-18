import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { apiClient, agentsApi } from '../../api/client'
import type { Agent } from '../../types'

// ─── Types ────────────────────────────────────────────────────────────────────
type Channel = 'voice' | 'chat' | 'email' | 'backoffice'

interface ChannelAssignment {
  id:      string
  agentId: string
  date:    string
  slotMin: number
  channel: Channel
}

interface SlotAgent {
  id:      string
  agentId?: string
  start:   number
  end:     number
  off:     string[]
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CHANNELS: Channel[] = ['voice', 'chat', 'email', 'backoffice']

const CHANNEL_COLORS: Record<Channel, { bg: string; border: string; text: string; label: string }> = {
  voice:      { bg: 'bg-blue-100',   border: 'border-blue-300',   text: 'text-blue-700',   label: 'Voice'      },
  chat:       { bg: 'bg-emerald-100',border: 'border-emerald-300',text: 'text-emerald-700',label: 'Chat'       },
  email:      { bg: 'bg-amber-100',  border: 'border-amber-300',  text: 'text-amber-700',  label: 'Email'      },
  backoffice: { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-700', label: 'Back Office'},
}

function minToStr(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WFM_DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const JS_WFM    = [6, 0, 1, 2, 3, 4, 5]

interface Props {
  /** Optional: pass slotAgents from the currently loaded schedule so we know agent work hours */
  slotAgents?: SlotAgent[]
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChannelTimeline({ slotAgents = [] }: Props) {
  const [agents,      setAgents]      = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedDate,  setSelectedDate]  = useState(toDateStr(new Date()))
  const [assignments,   setAssignments]   = useState<ChannelAssignment[]>([])
  const [loading,       setLoading]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [pendingChanges, setPendingChanges] = useState<Record<number, Channel>>({})

  useEffect(() => {
    agentsApi.list().then(r => setAgents(r.data)).catch(() => {})
  }, [])

  const loadAssignments = useCallback(async () => {
    if (!selectedAgent || !selectedDate) return
    setLoading(true)
    try {
      const res = await apiClient.get<ChannelAssignment[]>(
        `/channel-assignments?agentId=${selectedAgent}&date=${selectedDate}`
      )
      setAssignments(res.data)
      setPendingChanges({})
    } catch {
      toast.error('Failed to load channel assignments.')
    } finally {
      setLoading(false)
    }
  }, [selectedAgent, selectedDate])

  useEffect(() => { loadAssignments() }, [loadAssignments])

  // Determine which slots the agent is working (from slotAgents or all day)
  const agentSlotEntry = slotAgents.find(s => s.agentId === selectedAgent)
  const workStart = agentSlotEntry?.start ?? 0
  const workEnd   = agentSlotEntry?.end   ?? 24 * 60

  // Build slot list (only working hours, 30-min intervals)
  const activeSlots: number[] = []
  for (let m = workStart; m < workEnd; m += 30) {
    activeSlots.push(m)
  }

  function getChannel(slotMin: number): Channel | null {
    if (slotMin in pendingChanges) return pendingChanges[slotMin]
    const a = assignments.find(a => a.slotMin === slotMin)
    return a?.channel ?? null
  }

  function setSlotChannel(slotMin: number, channel: Channel) {
    setPendingChanges(prev => ({ ...prev, [slotMin]: channel }))
  }

  async function saveChanges() {
    if (!selectedAgent || !selectedDate) return
    setSaving(true)
    try {
      // Build full assignment list: merge existing + pending
      const merged: Record<number, Channel> = {}
      for (const a of assignments) merged[a.slotMin] = a.channel
      for (const [slot, ch] of Object.entries(pendingChanges)) merged[Number(slot)] = ch

      await apiClient.put('/channel-assignments', {
        agentId:     selectedAgent,
        date:        selectedDate,
        assignments: Object.entries(merged).map(([slotMin, channel]) => ({
          slotMin: Number(slotMin),
          channel,
        })),
      })
      toast.success('Channel assignments saved.')
      setPendingChanges({})
      loadAssignments()
    } catch {
      toast.error('Failed to save assignments.')
    } finally {
      setSaving(false)
    }
  }

  const hasPending = Object.keys(pendingChanges).length > 0
  const agentName  = agents.find(a => a.id === selectedAgent)?.name ?? ''

  // Get WFM day for the selected date
  const selDate    = new Date(selectedDate + 'T00:00:00')
  const wfmDay     = WFM_DAYS[JS_WFM[selDate.getDay()]]

  // Check if agent is off on this day
  const isOff = agentSlotEntry?.off?.includes(wfmDay) ?? false

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Channel Timeline</h3>
        <p className="text-xs text-gray-500 mt-0.5">Assign a communication channel to each 30-min slot for an agent.</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Agent</label>
          <select className="input" value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}>
            <option value="">Select agent…</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.agentCode})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)} />
        </div>
        {hasPending && (
          <button
            onClick={saveChanges}
            disabled={saving}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold
                       rounded-xl px-4 py-2.5 text-sm transition-all disabled:opacity-50 shadow-glow-sm"
          >
            {saving ? 'Saving…' : `Save ${Object.keys(pendingChanges).length} Change${Object.keys(pendingChanges).length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {CHANNELS.map(ch => (
          <div key={ch} className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border
            ${CHANNEL_COLORS[ch].bg} ${CHANNEL_COLORS[ch].border} ${CHANNEL_COLORS[ch].text}`}>
            {CHANNEL_COLORS[ch].label}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border
          bg-gray-50 border-gray-200 text-gray-400">
          Unassigned
        </div>
      </div>

      {/* Timeline */}
      {!selectedAgent ? (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
          Select an agent to view their channel timeline
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
      ) : isOff ? (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
          {agentName} is off on {selectedDate}
        </div>
      ) : activeSlots.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
          No scheduled slots found for {agentName} on {selectedDate}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-max">
            {/* Time labels */}
            <div className="flex gap-0.5 mb-1">
              {activeSlots.map(slotMin => (
                <div key={slotMin} className="w-14 text-center text-[9px] text-gray-400 font-mono">
                  {minToStr(slotMin)}
                </div>
              ))}
            </div>

            {/* Slot cells */}
            <div className="flex gap-0.5">
              {activeSlots.map(slotMin => {
                const ch      = getChannel(slotMin)
                const isPending = slotMin in pendingChanges
                const colors  = ch ? CHANNEL_COLORS[ch] : null

                return (
                  <div key={slotMin} className="relative group">
                    <motion.div
                      className={`w-14 h-10 rounded-lg border cursor-pointer transition-all flex items-center justify-center
                        ${colors ? `${colors.bg} ${colors.border}` : 'bg-gray-50 border-gray-200'}
                        ${isPending ? 'ring-2 ring-brand-400' : ''}
                        hover:opacity-80`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      {ch && (
                        <span className={`text-[9px] font-bold ${colors!.text}`}>
                          {ch === 'backoffice' ? 'BO' : ch.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </motion.div>

                    {/* Channel picker dropdown */}
                    <div className="absolute z-20 top-12 left-0 hidden group-hover:flex flex-col
                                    bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden w-28 p-1">
                      {CHANNELS.map(c => (
                        <button
                          key={c}
                          onClick={() => setSlotChannel(slotMin, c)}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium
                            hover:bg-gray-50 transition-all text-left
                            ${ch === c ? 'bg-brand-50 text-brand-700' : 'text-gray-700'}`}
                        >
                          <span className={`w-2 h-2 rounded-full ${CHANNEL_COLORS[c].bg} border ${CHANNEL_COLORS[c].border}`} />
                          {CHANNEL_COLORS[c].label}
                        </button>
                      ))}
                      {ch && (
                        <button
                          onClick={() => {
                            const updated = { ...pendingChanges }
                            delete updated[slotMin]
                            // Mark as unassigned by removing
                            setPendingChanges(prev => {
                              const copy = { ...prev }
                              delete copy[slotMin]
                              return copy
                            })
                          }}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium
                            text-red-500 hover:bg-red-50 transition-all text-left mt-0.5 border-t border-gray-100"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Agent row label */}
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-700">{agentName}</span>
              <span className="text-[10px] text-gray-400">
                {minToStr(workStart)} – {minToStr(workEnd)} · {wfmDay} {selectedDate}
              </span>
              {hasPending && (
                <span className="text-[10px] text-brand-600 font-semibold">
                  {Object.keys(pendingChanges).length} unsaved change{Object.keys(pendingChanges).length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
