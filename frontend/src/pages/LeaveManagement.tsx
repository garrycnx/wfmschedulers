import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  CalendarOff, Plus, X, Check, ChevronDown, Search,
  Clock, AlertCircle, Tag, Pencil, Trash2,
} from 'lucide-react'
import { apiClient } from '../api/client'
import { agentsApi } from '../api/client'
import type { Agent } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────
interface LeaveTypeConfig {
  id:          string
  name:        string
  description: string | null
  color:       string
  isPaid:      boolean
  isActive:    boolean
}

interface LeaveQuota {
  id:          string
  lobId:       string | null
  leaveType:   string
  totalHours:  number
  periodStart: string
  periodEnd:   string
  maxPerDay:   number
  createdAt:   string
}

interface LeaveRequest {
  id:           string
  agentId:      string
  leaveType:    string
  startDate:    string
  endDate:      string
  durationType: string
  totalHours:   number
  status:       string
  notes:        string | null
  reviewedAt:   string | null
  createdAt:    string
  agent: { id: string; name: string; agentCode: string; email: string }
}

interface LeaveBalance {
  id:          string
  agentId:     string
  leaveType:   string
  totalHours:  number
  usedHours:   number
  year:        number
  agent?: { id: string; name: string; agentCode: string }
}

const PRESET_COLORS = [
  '#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b',
]

const STATUS_COLORS: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border border-red-200',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Leave Type Modal (Add / Edit) ────────────────────────────────────────────
interface LeaveTypeModalProps {
  onClose:  () => void
  onSaved:  () => void
  initial?: LeaveTypeConfig
}
function LeaveTypeModal({ onClose, onSaved, initial }: LeaveTypeModalProps) {
  const [name,        setName]        = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color,       setColor]       = useState(initial?.color ?? '#6366f1')
  const [isPaid,      setIsPaid]      = useState(initial?.isPaid ?? true)
  const [isActive,    setIsActive]    = useState(initial?.isActive ?? true)
  const [saving,      setSaving]      = useState(false)

  async function save() {
    if (!name.trim()) { toast.error('Name is required.'); return }
    setSaving(true)
    try {
      const payload = { name: name.trim(), description: description || null, color, isPaid, isActive }
      if (initial) {
        await apiClient.put(`/leave-types/${initial.id}`, payload)
        toast.success('Leave type updated.')
      } else {
        await apiClient.post('/leave-types', payload)
        toast.success('Leave type created.')
      }
      onSaved(); onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save.'
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.18 }}
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                   bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-[420px]">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900">{initial ? 'Edit Leave Type' : 'New Leave Type'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Name <span className="text-red-500">*</span></label>
            <input className="input" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Annual, Maternity, Study Leave…" />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Optional description…" />
          </div>
          <div>
            <label className="label">Colour</label>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="w-7 h-7 rounded-full cursor-pointer border border-gray-200" title="Custom colour" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={isPaid} onChange={e => setIsPaid(e.target.checked)}
                className="w-4 h-4 rounded accent-brand-600" />
              <span className="text-sm font-medium text-gray-700">Paid leave</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded accent-brand-600" />
              <span className="text-sm font-medium text-gray-700">Active</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-500
                       text-white transition-all disabled:opacity-50">
            {saving ? 'Saving…' : (initial ? 'Update' : 'Create')}
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ─── Quota Modal ──────────────────────────────────────────────────────────────
interface QuotaModalProps {
  onClose:    () => void
  onSaved:    () => void
  initial?:   LeaveQuota
  leaveTypes: LeaveTypeConfig[]
}
function QuotaModal({ onClose, onSaved, initial, leaveTypes }: QuotaModalProps) {
  const [leaveType,   setLeaveType]   = useState(initial?.leaveType ?? leaveTypes[0]?.name ?? '')
  const [totalHours,  setTotalHours]  = useState(String(initial?.totalHours ?? 40))
  const [periodStart, setPeriodStart] = useState(initial?.periodStart?.split('T')[0] ?? new Date().getFullYear() + '-01-01')
  const [periodEnd,   setPeriodEnd]   = useState(initial?.periodEnd?.split('T')[0]   ?? new Date().getFullYear() + '-12-31')
  const [maxPerDay,   setMaxPerDay]   = useState(String(initial?.maxPerDay ?? 3))
  const [saving,      setSaving]      = useState(false)

  async function save() {
    if (!totalHours || !periodStart || !periodEnd) {
      toast.error('Please fill all required fields.'); return
    }
    setSaving(true)
    try {
      const payload = { leaveType, totalHours: Number(totalHours), periodStart, periodEnd, maxPerDay: Number(maxPerDay) }
      if (initial) {
        await apiClient.put(`/leave-quotas/${initial.id}`, payload)
        toast.success('Quota updated.')
      } else {
        await apiClient.post('/leave-quotas', payload)
        toast.success('Quota created.')
      }
      onSaved(); onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save quota.'
      toast.error(msg)
    } finally { setSaving(false) }
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.18 }}
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                   bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-96">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900">{initial ? 'Edit Quota' : 'New Leave Quota'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Leave Type</label>
            <select className="input" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
              {leaveTypes.filter(t => t.isActive).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Total Hours Allocated</label>
            <input type="number" min="1" className="input" value={totalHours}
              onChange={e => setTotalHours(e.target.value)} placeholder="40" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Period Start</label>
              <input type="date" className="input" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <label className="label">Period End</label>
              <input type="date" className="input" value={periodEnd} min={periodStart} onChange={e => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Max Agents On Leave Same Day</label>
            <input type="number" min="1" className="input" value={maxPerDay}
              onChange={e => setMaxPerDay(e.target.value)} placeholder="3" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-500
                       text-white transition-all disabled:opacity-50">
            {saving ? 'Saving…' : (initial ? 'Update' : 'Create')}
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ─── Balance Allocate Modal ───────────────────────────────────────────────────
interface AllocateModalProps {
  agents:     Agent[]
  leaveTypes: LeaveTypeConfig[]
  onClose:    () => void
  onSaved:    () => void
}
function AllocateModal({ agents, leaveTypes, onClose, onSaved }: AllocateModalProps) {
  const [agentId,    setAgentId]    = useState('')
  const [leaveType,  setLeaveType]  = useState(leaveTypes[0]?.name ?? 'Annual')
  const [totalHours, setTotalHours] = useState('40')
  const [year,       setYear]       = useState(String(new Date().getFullYear()))
  const [saving,     setSaving]     = useState(false)

  async function save() {
    if (!agentId) { toast.error('Select an agent.'); return }
    setSaving(true)
    try {
      await apiClient.post('/leave-balances', { agentId, leaveType, totalHours: Number(totalHours), year: Number(year) })
      toast.success('Balance allocated.')
      onSaved(); onClose()
    } catch {
      toast.error('Failed to allocate balance.')
    } finally { setSaving(false) }
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.18 }}
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                   bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-96">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900">Allocate Leave Hours</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Agent</label>
            <select className="input" value={agentId} onChange={e => setAgentId(e.target.value)}>
              <option value="">Select agent…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.agentCode})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Leave Type</label>
            <select className="input" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
              {leaveTypes.filter(t => t.isActive).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Total Hours</label>
              <input type="number" min="0" className="input" value={totalHours} onChange={e => setTotalHours(e.target.value)} />
            </div>
            <div>
              <label className="label">Year</label>
              <input type="number" className="input" value={year} onChange={e => setYear(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-500
                       text-white transition-all disabled:opacity-50">
            {saving ? 'Saving…' : 'Allocate'}
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LeaveManagement() {
  const [activeTab,       setActiveTab]       = useState<'requests' | 'quotas' | 'balances' | 'types'>('requests')
  const [quotas,          setQuotas]          = useState<LeaveQuota[]>([])
  const [requests,        setRequests]        = useState<LeaveRequest[]>([])
  const [balances,        setBalances]        = useState<LeaveBalance[]>([])
  const [agents,          setAgents]          = useState<Agent[]>([])
  const [leaveTypes,      setLeaveTypes]      = useState<LeaveTypeConfig[]>([])
  const [loading,         setLoading]         = useState(false)
  const [showQuotaMod,    setShowQuotaMod]    = useState(false)
  const [editQuota,       setEditQuota]       = useState<LeaveQuota | undefined>()
  const [showAllocMod,    setShowAllocMod]    = useState(false)
  const [showTypeMod,     setShowTypeMod]     = useState(false)
  const [editLeaveType,   setEditLeaveType]   = useState<LeaveTypeConfig | undefined>()
  const [statusFilter,    setStatusFilter]    = useState('pending')
  const [searchAgent,     setSearchAgent]     = useState('')
  const [confirmId,       setConfirmId]       = useState<string | null>(null)
  const [confirmAction,   setConfirmAction]   = useState<'approve' | 'reject' | null>(null)
  const [actioning,       setActioning]       = useState(false)
  const [deleteTypeId,    setDeleteTypeId]    = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [qRes, rRes, bRes, aRes, tRes] = await Promise.all([
        apiClient.get<LeaveQuota[]>('/leave-quotas'),
        apiClient.get<LeaveRequest[]>(`/leave-requests${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`),
        apiClient.get<LeaveBalance[]>('/leave-balances'),
        agentsApi.list(),
        apiClient.get<LeaveTypeConfig[]>('/leave-types'),
      ])
      setQuotas(qRes.data)
      setRequests(rRes.data)
      setBalances(bRes.data)
      setAgents(aRes.data)
      setLeaveTypes(tRes.data)
    } catch {
      toast.error('Failed to load leave data.')
    } finally {
      setLoading(false)
    }
  }

  async function deleteLeaveType(id: string) {
    try {
      await apiClient.delete(`/leave-types/${id}`)
      toast.success('Leave type deleted.')
      setLeaveTypes(prev => prev.filter(t => t.id !== id))
    } catch {
      toast.error('Failed to delete leave type.')
    } finally {
      setDeleteTypeId(null)
    }
  }

  useEffect(() => { loadAll() }, [statusFilter])

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setActioning(true)
    try {
      await apiClient.patch(`/leave-requests/${id}/${action}`)
      toast.success(`Request ${action}d.`)
      setConfirmId(null)
      setConfirmAction(null)
      loadAll()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? `Failed to ${action}.`
      toast.error(msg)
    } finally {
      setActioning(false)
    }
  }

  async function deleteQuota(id: string) {
    try {
      await apiClient.delete(`/leave-quotas/${id}`)
      toast.success('Quota deleted.')
      setQuotas(prev => prev.filter(q => q.id !== id))
    } catch {
      toast.error('Failed to delete quota.')
    }
  }

  // Group balances by agent
  const balanceByAgent = useMemo(() => {
    const map: Record<string, { agent: { name: string; agentCode: string }; balances: Record<string, { total: number; used: number }> }> = {}
    for (const b of balances) {
      if (!b.agent) continue
      if (!map[b.agentId]) map[b.agentId] = { agent: b.agent, balances: {} }
      map[b.agentId].balances[b.leaveType] = { total: b.totalHours, used: b.usedHours }
    }
    return map
  }, [balances])

  const filteredAgentBalances = useMemo(() => {
    const entries = Object.entries(balanceByAgent)
    if (!searchAgent) return entries
    const q = searchAgent.toLowerCase()
    return entries.filter(([, v]) =>
      v.agent.name.toLowerCase().includes(q) || v.agent.agentCode.toLowerCase().includes(q)
    )
  }, [balanceByAgent, searchAgent])

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CalendarOff className="w-5 h-5 text-brand-600" />
            Leave Management
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage leave quotas, approve requests, and track balances.</p>
        </div>
        {activeTab === 'types' && (
          <button onClick={() => { setEditLeaveType(undefined); setShowTypeMod(true) }}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold
                       rounded-xl px-4 py-2.5 text-sm transition-all shadow-glow-sm">
            <Plus className="w-4 h-4" /> New Leave Type
          </button>
        )}
        {activeTab === 'quotas' && (
          <button onClick={() => { setEditQuota(undefined); setShowQuotaMod(true) }}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold
                       rounded-xl px-4 py-2.5 text-sm transition-all shadow-glow-sm">
            <Plus className="w-4 h-4" /> New Quota
          </button>
        )}
        {activeTab === 'balances' && (
          <button onClick={() => setShowAllocMod(true)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold
                       rounded-xl px-4 py-2.5 text-sm transition-all shadow-glow-sm">
            <Plus className="w-4 h-4" /> Allocate Hours
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([['requests', 'Requests'], ['quotas', 'Quotas'], ['balances', 'Balances'], ['types', 'Leave Types']] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center text-gray-400 py-12 text-sm">Loading…</div>
      )}

      {/* ── REQUESTS TAB ──────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'requests' && (
        <div className="bg-white border border-gray-200 rounded-2xl">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Leave Requests</h3>
              <p className="text-xs text-gray-500 mt-0.5">{requests.length} request{requests.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  className="input pr-8 appearance-none text-sm"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {requests.length === 0 ? (
            <div className="p-12 text-center">
              <CalendarOff className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No {statusFilter !== 'all' ? statusFilter : ''} requests found.</p>
            </div>
          ) : (
            <table className="wfm-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Agent</th>
                  <th className="text-left">Type</th>
                  <th className="text-center">Dates</th>
                  <th className="text-center">Duration</th>
                  <th className="text-center">Hours</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div className="font-medium text-gray-900">{r.agent.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{r.agent.agentCode}</div>
                    </td>
                    <td>
                      <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-brand-50 text-brand-700">
                        {r.leaveType}
                      </span>
                    </td>
                    <td className="text-center text-xs text-gray-600">
                      {fmtDate(r.startDate)}
                      {r.startDate !== r.endDate && ` → ${fmtDate(r.endDate)}`}
                    </td>
                    <td className="text-center text-xs text-gray-500 capitalize">
                      {r.durationType.replace(/_/g, ' ')}
                    </td>
                    <td className="text-center font-semibold text-gray-700">{r.totalHours}h</td>
                    <td className="text-center">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${STATUS_COLORS[r.status] ?? ''}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="text-center">
                      {r.status === 'pending' && (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => { setConfirmId(r.id); setConfirmAction('approve') }}
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg
                                       bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => { setConfirmId(r.id); setConfirmAction('reject') }}
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg
                                       bg-red-50 text-red-600 hover:bg-red-100 transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </div>
                      )}
                      {r.status !== 'pending' && (
                        <span className="text-xs text-gray-400">
                          {r.reviewedAt ? fmtDate(r.reviewedAt) : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── QUOTAS TAB ────────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'quotas' && (
        <div className="bg-white border border-gray-200 rounded-2xl">
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Leave Quotas</h3>
            <p className="text-xs text-gray-500 mt-0.5">Define leave entitlements per type and period.</p>
          </div>

          {quotas.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No quotas defined yet.</p>
              <button
                onClick={() => { setEditQuota(undefined); setShowQuotaMod(true) }}
                className="mt-3 text-sm font-semibold text-brand-600 hover:underline"
              >
                + Create first quota
              </button>
            </div>
          ) : (
            <table className="wfm-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Leave Type</th>
                  <th className="text-center">Total Hours</th>
                  <th className="text-center">Period</th>
                  <th className="text-center">Max/Day</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotas.map(q => (
                  <tr key={q.id}>
                    <td>
                      <span className="text-sm font-semibold px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700">
                        {q.leaveType}
                      </span>
                    </td>
                    <td className="text-center font-semibold text-gray-700">{q.totalHours}h</td>
                    <td className="text-center text-xs text-gray-500">
                      {fmtDate(q.periodStart)} → {fmtDate(q.periodEnd)}
                    </td>
                    <td className="text-center text-gray-600">{q.maxPerDay}</td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => { setEditQuota(q); setShowQuotaMod(true) }}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-gray-50 text-gray-600
                                     hover:bg-gray-100 transition-all"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteQuota(q.id)}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600
                                     hover:bg-red-100 transition-all"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── BALANCES TAB ──────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'balances' && (
        <div className="bg-white border border-gray-200 rounded-2xl">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Leave Balances</h3>
              <p className="text-xs text-gray-500 mt-0.5">Remaining vs allocated hours per agent.</p>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                className="input pl-8 text-sm w-52"
                placeholder="Search agent…"
                value={searchAgent}
                onChange={e => setSearchAgent(e.target.value)}
              />
            </div>
          </div>

          {filteredAgentBalances.length === 0 ? (
            <div className="p-12 text-center">
              <AlertCircle className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">
                {searchAgent ? 'No agents match your search.' : 'No balances allocated yet.'}
              </p>
              {!searchAgent && (
                <button
                  onClick={() => setShowAllocMod(true)}
                  className="mt-3 text-sm font-semibold text-brand-600 hover:underline"
                >
                  + Allocate leave hours
                </button>
              )}
            </div>
          ) : (
            <table className="wfm-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Agent</th>
                  {leaveTypes.filter(t => t.isActive).map(t => (
                    <th key={t.id} className="text-center">{t.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAgentBalances.map(([agentId, v]) => (
                  <tr key={agentId}>
                    <td>
                      <div className="font-medium text-gray-900">{v.agent.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{v.agent.agentCode}</div>
                    </td>
                    {leaveTypes.filter(t => t.isActive).map(t => {
                      const b = v.balances[t.name] ?? { total: 0, used: 0 }
                      const remaining = b.total - b.used
                      const pct = b.total > 0 ? (remaining / b.total) * 100 : 0
                      return (
                        <td key={t.id} className="text-center">
                          {b.total === 0 ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <>
                              <div className="text-xs font-semibold text-gray-700">{remaining}h / {b.total}h</div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 mx-auto max-w-[80px]">
                                <div className={`h-1.5 rounded-full transition-all ${pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                              </div>
                            </>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── LEAVE TYPES TAB ───────────────────────────────────────────────────── */}
      {!loading && activeTab === 'types' && (
        <div className="bg-white border border-gray-200 rounded-2xl">
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Leave Types</h3>
            <p className="text-xs text-gray-500 mt-0.5">Define the leave categories agents can apply for.</p>
          </div>

          {leaveTypes.length === 0 ? (
            <div className="p-12 text-center">
              <Tag className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No leave types defined yet.</p>
              <button onClick={() => { setEditLeaveType(undefined); setShowTypeMod(true) }}
                className="mt-3 text-sm font-semibold text-brand-600 hover:underline">
                + Create first leave type
              </button>
            </div>
          ) : (
            <table className="wfm-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Name</th>
                  <th className="text-left">Description</th>
                  <th className="text-center">Paid</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaveTypes.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        <span className="font-semibold text-gray-900">{t.name}</span>
                      </div>
                    </td>
                    <td className="text-sm text-gray-500">{t.description ?? '—'}</td>
                    <td className="text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${t.isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {t.isPaid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${t.isActive ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => { setEditLeaveType(t); setShowTypeMod(true) }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-all">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteTypeId(t.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Delete Leave Type Confirm ──────────────────────────────────────────── */}
      <AnimatePresence>
        {deleteTypeId && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDeleteTypeId(null)} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}
              className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                         bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-80">
              <h3 className="font-bold text-gray-900 mb-2">Delete Leave Type?</h3>
              <p className="text-sm text-gray-500 mb-5">
                This will remove this leave type. Existing requests and balances using this type will not be affected.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTypeId(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={() => deleteLeaveType(deleteTypeId)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition-all">
                  Delete
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Confirm Action Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {confirmId && confirmAction && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setConfirmId(null); setConfirmAction(null) }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                         bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-80"
            >
              <h3 className="font-bold text-gray-900 mb-2 capitalize">{confirmAction} Leave Request?</h3>
              <p className="text-sm text-gray-500 mb-5">
                {confirmAction === 'approve'
                  ? 'This will approve the request and deduct hours from the agent\'s balance.'
                  : 'This will reject the request. The agent will be notified.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setConfirmId(null); setConfirmAction(null) }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAction(confirmId, confirmAction)}
                  disabled={actioning}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 ${
                    confirmAction === 'approve' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  {actioning ? 'Processing…' : `Yes, ${confirmAction}`}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showTypeMod && (
          <LeaveTypeModal
            initial={editLeaveType}
            onClose={() => { setShowTypeMod(false); setEditLeaveType(undefined) }}
            onSaved={loadAll}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showQuotaMod && (
          <QuotaModal
            initial={editQuota}
            leaveTypes={leaveTypes}
            onClose={() => { setShowQuotaMod(false); setEditQuota(undefined) }}
            onSaved={loadAll}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAllocMod && (
          <AllocateModal
            agents={agents}
            leaveTypes={leaveTypes}
            onClose={() => setShowAllocMod(false)}
            onSaved={loadAll}
          />
        )}
      </AnimatePresence>

    </div>
  )
}
