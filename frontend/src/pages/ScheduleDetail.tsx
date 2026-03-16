import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, CalendarDays, Users, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { schedulesApi } from '../api/client'

// ─── Types ────────────────────────────────────────────────────────────────────
interface BackendSchedule {
  id: string
  name: string
  weekStartDate: string
  status: string
  createdAt: string
  settingsJson?: string
  agentsJson?: string
  projectionsJson?: string
}

interface EditForm {
  name: string
  releaseFrom: string
  releaseTo: string
  status: 'released' | 'archived'
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ScheduleDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<EditForm>({
    name: '',
    releaseFrom: '',
    releaseTo: '',
    status: 'released',
  })
  const [dirty, setDirty] = useState(false)

  // ── Fetch schedule ──────────────────────────────────────────────────────────
  const { data: schedule, isLoading, isError } = useQuery<BackendSchedule>({
    queryKey: ['schedule', id],
    queryFn: () => schedulesApi.get(id!).then((r) => r.data as BackendSchedule),
    enabled: !!id,
  })

  // Populate form once data arrives
  useEffect(() => {
    if (!schedule) return
    let releaseFrom = (schedule.weekStartDate ?? '').split('T')[0]
    let releaseTo = releaseFrom
    let name = schedule.name ?? ''

    try {
      const settings = JSON.parse(schedule.settingsJson ?? '{}')
      if (settings.releaseFrom) releaseFrom = settings.releaseFrom
      if (settings.releaseTo) releaseTo = settings.releaseTo
    } catch { /* ignore */ }

    setForm({
      name,
      releaseFrom,
      releaseTo,
      status: schedule.status === 'archived' ? 'archived' : 'released',
    })
    setDirty(false)
  }, [schedule])

  // ── Save mutation ───────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => {
      const existing = schedule!
      let settings: Record<string, unknown> = {}
      try { settings = JSON.parse(existing.settingsJson ?? '{}') } catch { /* ignore */ }

      settings.releaseFrom = form.releaseFrom
      settings.releaseTo = form.releaseTo

      return schedulesApi.update(id!, {
        name: form.name,
        status: form.status,
        settingsJson: JSON.stringify(settings),
      })
    },
    onSuccess: () => {
      toast.success('Schedule updated successfully.')
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      queryClient.invalidateQueries({ queryKey: ['schedule', id] })
      setDirty(false)
    },
    onError: () => {
      toast.error('Failed to save. Please try again.')
    },
  })

  function handleChange<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  // ── Derived helpers ─────────────────────────────────────────────────────────
  function fmtDateTime(iso: string) {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  let agentCount = 0
  try {
    const agents = JSON.parse(schedule?.agentsJson ?? '[]')
    agentCount = Array.isArray(agents) ? agents.length : 0
  } catch { /* ignore */ }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/schedules')}
          className="p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-base font-bold text-gray-900">Edit Schedule</h2>
          <p className="text-xs text-gray-400">
            {schedule ? `Created ${fmtDateTime(schedule.createdAt)}` : 'Loading…'}
          </p>
        </div>
      </div>

      {/* Loading / Error states */}
      {isLoading && (
        <div className="card p-12 text-center">
          <p className="text-gray-400 text-sm animate-pulse">Loading schedule…</p>
        </div>
      )}

      {isError && (
        <div className="card p-12 text-center">
          <p className="text-red-500 text-sm font-medium">Failed to load schedule.</p>
          <button
            onClick={() => navigate('/schedules')}
            className="mt-3 text-brand-600 hover:text-brand-500 text-sm font-semibold"
          >
            ← Back to history
          </button>
        </div>
      )}

      {/* Edit form */}
      {schedule && !isLoading && !isError && (
        <div className="card p-6 space-y-5">

          {/* Schedule name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Schedule Name
            </label>
            <input
              className="input w-full"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. Week 12 Schedule"
            />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                <CalendarDays className="inline w-3.5 h-3.5 mr-1" />
                From Date
              </label>
              <input
                type="date"
                className="input w-full"
                value={form.releaseFrom}
                onChange={(e) => handleChange('releaseFrom', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                <CalendarDays className="inline w-3.5 h-3.5 mr-1" />
                To Date
              </label>
              <input
                type="date"
                className="input w-full"
                value={form.releaseTo}
                onChange={(e) => handleChange('releaseTo', e.target.value)}
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Status
            </label>
            <select
              className="input w-full"
              value={form.status}
              onChange={(e) => handleChange('status', e.target.value as 'released' | 'archived')}
            >
              <option value="released">Released</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Read-only info */}
          <div className="flex gap-6 pt-1 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <span><strong>{agentCount}</strong> agents</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <TrendingUp className="w-3.5 h-3.5 text-gray-400" />
              <span>Projections preserved</span>
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40
                         disabled:cursor-not-allowed text-white font-semibold rounded-xl px-5 py-2.5
                         text-sm transition-all shadow-glow-sm"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
