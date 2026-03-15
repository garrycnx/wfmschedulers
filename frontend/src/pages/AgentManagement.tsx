import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, Edit2, Trash2, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import type { AgentFormData, AgentStatus, SkillLevel } from '../types'
import AgentModal from '../components/agents/AgentModal'
import { useAgentStore } from '../store/agentStore'
import { useScheduleStore } from '../store/scheduleStore'
import { minToTime } from '../utils/scheduleEngine'

const statusStyle: Record<AgentStatus, string> = {
  active:   'badge-green',
  on_leave: 'badge-yellow',
  inactive: 'badge-slate',
}

const skillStyle: Record<SkillLevel, string> = {
  lead:   'badge-brand',
  senior: 'badge-brand',
  mid:    'badge-slate',
  junior: 'badge-slate',
}

export default function AgentManagement() {
  const { agents, addAgent, updateAgent, deleteAgent } = useAgentStore()
  const { agents: slots, agentAssignments, assignAgent, unassignAgent } = useScheduleStore()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<AgentStatus | 'all'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)

  const editingAgent = editingAgentId ? agents.find((a) => a.id === editingAgentId) ?? null : null

  const filtered = agents.filter((a) => {
    const matchSearch = a.name.toLowerCase().includes(search.toLowerCase()) ||
                        a.email.toLowerCase().includes(search.toLowerCase()) ||
                        a.agentCode.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || a.status === statusFilter
    return matchSearch && matchStatus
  })

  function handleSave(data: AgentFormData) {
    if (editingAgent) {
      updateAgent(editingAgent.id, data)
      toast.success('Agent updated.')
    } else {
      addAgent(data)
      toast.success('Agent created.')
    }
    setModalOpen(false)
    setEditingAgentId(null)
  }

  function handleDelete(id: string) {
    deleteAgent(id)
    toast.success('Agent removed.')
  }

  function handleInvite(email: string) {
    toast.success(`Portal invite sent to ${email}`)
  }

  // Reverse map: real agent id → assigned slot id
  const agentToSlot = Object.fromEntries(
    Object.entries(agentAssignments).map(([slotId, realId]) => [realId, slotId]),
  )

  const stats = {
    total: agents.length,
    active: agents.filter((a) => a.status === 'active').length,
    onLeave: agents.filter((a) => a.status === 'on_leave').length,
    inactive: agents.filter((a) => a.status === 'inactive').length,
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Agents', value: stats.total, color: 'brand' },
          { label: 'Active',       value: stats.active, color: 'emerald' },
          { label: 'On Leave',     value: stats.onLeave, color: 'amber' },
          { label: 'Inactive',     value: stats.inactive, color: 'slate' },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search agents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AgentStatus | 'all')}
            className="input w-auto pr-8 appearance-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="on_leave">On Leave</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <button
          onClick={() => { setEditingAgentId(null); setModalOpen(true) }}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold
                     rounded-xl px-4 py-2.5 text-sm transition-all shadow-glow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Agent
        </button>
      </div>

      {/* Agents table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="wfm-table w-full">
          <thead>
            <tr>
              <th className="text-left">Agent</th>
              <th className="text-left hidden md:table-cell">Team</th>
              <th className="text-center hidden lg:table-cell">Skill</th>
              <th className="text-center">Status</th>
              <th className="text-left hidden lg:table-cell">Hire Date</th>
              <th className="text-center">Assign Shift</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {filtered.map((agent) => {
                const assignedSlotId = agentToSlot[agent.id]
                const assignedSlot = slots.find((s) => s.id === assignedSlotId)
                return (
                  <motion.tr
                    key={agent.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="group"
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center">
                          <span className="text-sm font-bold text-brand-600">
                            {agent.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{agent.name}</p>
                          <p className="text-xs text-gray-500">{agent.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell text-gray-600 text-sm">{agent.team ?? '—'}</td>
                    <td className="hidden lg:table-cell text-center">
                      <span className={skillStyle[agent.skill]}>{agent.skill}</span>
                    </td>
                    <td className="text-center">
                      <span className={statusStyle[agent.status]}>{agent.status.replace('_', ' ')}</span>
                    </td>
                    <td className="hidden lg:table-cell text-gray-600 text-sm">
                      {new Date(agent.hireDate).toLocaleDateString('en-GB')}
                    </td>
                    <td className="text-center">
                      {slots.length > 0 ? (
                        <select
                          className="input text-xs py-1.5 w-44"
                          value={assignedSlotId ?? ''}
                          onChange={(e) => {
                            const val = e.target.value
                            // Unassign previous slot for this agent
                            if (assignedSlotId) unassignAgent(assignedSlotId)
                            if (val) {
                              // Unassign whoever was in this slot before
                              if (agentAssignments[val]) unassignAgent(val)
                              assignAgent(val, agent.id)
                            }
                          }}
                        >
                          <option value="">— No shift —</option>
                          {slots.map((s) => {
                            const taken = agentAssignments[s.id] && agentAssignments[s.id] !== agent.id
                            const takenName = taken
                              ? agents.find((a) => a.id === agentAssignments[s.id])?.name
                              : null
                            return (
                              <option key={s.id} value={s.id} disabled={!!taken}>
                                {s.id} {minToTime(s.start)}–{minToTime(s.end)}
                                {takenName ? ` (${takenName})` : ''}
                              </option>
                            )
                          })}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Generate schedule first</span>
                      )}
                      {assignedSlot && (
                        <p className="text-[10px] text-brand-600 mt-0.5 font-medium">
                          {assignedSlot.id}: {minToTime(assignedSlot.start)}–{minToTime(assignedSlot.end)}
                          · Off: {assignedSlot.off.join(', ')}
                        </p>
                      )}
                    </td>
                    <td className="text-right relative">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditingAgentId(agent.id); setModalOpen(true) }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleInvite(agent.email)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-all"
                          title="Send portal invite"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(agent.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </AnimatePresence>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-gray-500 py-8 text-sm">
                  No agents match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Agent modal */}
      <AgentModal
        open={modalOpen}
        agent={editingAgent}
        onClose={() => { setModalOpen(false); setEditingAgentId(null) }}
        onSave={handleSave}
      />
    </div>
  )
}
