import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, KeyRound, Eye, EyeOff, Info } from 'lucide-react'
import type { Agent, AgentFormData, AgentStatus, SkillLevel } from '../../types'

interface Props {
  open: boolean
  agent: Agent | null
  onClose: () => void
  onSave: (data: AgentFormData) => void
}

const EMPTY: AgentFormData = {
  name: '',
  email: '',
  phone: '',
  skill: 'mid',
  team: '',
  hireDate: new Date().toISOString().split('T')[0],
  status: 'active',
  employeeCode: '',
  password: 'password',
}

export default function AgentModal({ open, agent, onClose, onSave }: Props) {
  const [form, setForm] = useState<AgentFormData>(EMPTY)
  const [errors, setErrors] = useState<Partial<AgentFormData>>({})
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (agent) {
      setForm({
        name: agent.name,
        email: agent.email,
        phone: agent.phone ?? '',
        skill: agent.skill,
        team: agent.team ?? '',
        hireDate: agent.hireDate,
        status: agent.status,
        employeeCode: agent.agentCode,
        password: '',          // blank = keep existing password
      })
    } else {
      setForm(EMPTY)
    }
    setErrors({})
    setShowPassword(false)
  }, [agent, open])

  function validate(): boolean {
    const e: Partial<AgentFormData> = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email required'
    if (!agent && !form.employeeCode?.trim()) e.employeeCode = 'Employee ID is required'
    if (form.employeeCode?.trim() && !/^[A-Za-z0-9_-]+$/.test(form.employeeCode.trim()))
      e.employeeCode = 'Only letters, numbers, hyphens and underscores allowed'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (validate()) onSave(form)
  }

  const set = (field: keyof AgentFormData) =>
    (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: ev.target.value }))

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white z-10">
                <h2 className="text-base font-bold text-gray-900">
                  {agent ? 'Edit Agent' : 'Add New Agent'}
                </h2>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-5 space-y-5">

                {/* ── Identity ─────────────────────────────────────── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Identity</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Full Name *</label>
                      <input
                        className="input"
                        value={form.name}
                        onChange={set('name')}
                        placeholder="Alice Johnson"
                      />
                      {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                    </div>
                    <div>
                      <label className="label">Employee ID *</label>
                      <input
                        className={`input font-mono uppercase ${errors.employeeCode ? 'border-red-400 focus:ring-red-300' : ''}`}
                        value={form.employeeCode}
                        onChange={set('employeeCode')}
                        placeholder="e.g. AG007"
                        disabled={!!agent}           // can't rename existing agent's ID
                      />
                      {errors.employeeCode
                        ? <p className="text-xs text-red-500 mt-1">{errors.employeeCode}</p>
                        : !agent && <p className="text-[10px] text-gray-400 mt-1">Must be unique across your team</p>
                      }
                    </div>
                    <div>
                      <label className="label">Email *</label>
                      <input
                        className="input"
                        type="email"
                        value={form.email}
                        onChange={set('email')}
                        placeholder="alice@example.com"
                      />
                      {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                    </div>
                    <div>
                      <label className="label">Phone</label>
                      <input
                        className="input"
                        value={form.phone}
                        onChange={set('phone')}
                        placeholder="+44 7700 000000"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Role & Team ───────────────────────────────────── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Role & Team</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Team</label>
                      <input
                        className="input"
                        value={form.team}
                        onChange={set('team')}
                        placeholder="Team A"
                      />
                    </div>
                    <div>
                      <label className="label">Skill Level</label>
                      <select className="input" value={form.skill} onChange={set('skill')}>
                        <option value="junior">Junior</option>
                        <option value="mid">Mid</option>
                        <option value="senior">Senior</option>
                        <option value="lead">Lead</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Status</label>
                      <select className="input" value={form.status} onChange={set('status')}>
                        <option value="active">Active</option>
                        <option value="on_leave">On Leave</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Hire Date</label>
                      <input
                        className="input"
                        type="date"
                        value={form.hireDate}
                        onChange={set('hireDate')}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Password ─────────────────────────────────────── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Portal Access
                  </p>
                  <div>
                    <label className="label flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-gray-400" />
                      {agent ? 'Set New Password' : 'Initial Password'}
                    </label>
                    <div className="relative">
                      <input
                        className="input pr-10"
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={set('password')}
                        placeholder={agent ? 'Leave blank to keep current password' : 'Default: password'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="mt-2 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                      <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        {agent
                          ? 'Agent will be prompted to reset their password on next login if you set a new one.'
                          : <>Default password is <strong>password</strong>. Agent should change it on first login.</>
                        }
                      </p>
                    </div>
                  </div>
                </div>

                {/* Create portal note */}
                {!agent && (
                  <div className="bg-brand-50 border border-brand-200 rounded-xl p-3">
                    <p className="text-xs text-brand-700">
                      After creating, use <strong>Send Portal Invite</strong> to email the agent a link.
                      They log in with their <strong>Employee ID</strong> + password.
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-800
                               hover:bg-gray-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-500
                               text-white transition-all shadow-glow-sm"
                  >
                    {agent ? 'Save Changes' : 'Create Agent'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
