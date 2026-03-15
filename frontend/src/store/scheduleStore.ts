import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ScheduleSettings,
  ForecastRow,
  StaffingRow,
  ScheduledAgent,
  RosterRow,
  BreakRow,
  DayProjection,
  ScheduleOverride,
} from '../types'
import { DEFAULT_SETTINGS as DS } from '../types'
import { buildRosterRows } from '../utils/scheduleEngine'

export interface ReleaseHistoryEntry {
  id: string                        // unique – timestamp-based
  releasedAt: string                // ISO timestamp
  range: { from: string; to: string }
  agentCount: number
  projections: import('../types').DayProjection[]
  status: 'released' | 'archived'
}

export type GenerationStep =
  | 'idle'
  | 'uploading'
  | 'computing_required'
  | 'generating_roster'
  | 'assigning_breaks'
  | 'projecting'
  | 'done'
  | 'error'

interface ScheduleState {
  // Settings
  settings: ScheduleSettings
  updateSettings: (partial: Partial<ScheduleSettings>) => void

  // Forecast
  forecastRows: ForecastRow[]
  setForecast: (rows: ForecastRow[]) => void

  // Required staffing
  requiredStaff: StaffingRow[]
  setRequiredStaff: (rows: StaffingRow[]) => void

  // Generated schedule
  agents: ScheduledAgent[]
  rosterRows: RosterRow[]
  breakRows: BreakRow[]
  projections: DayProjection[]

  setAgents: (agents: ScheduledAgent[]) => void
  setRosterRows: (rows: RosterRow[]) => void
  setBreakRows: (rows: BreakRow[]) => void
  setProjections: (rows: DayProjection[]) => void

  // Inline shift change: update an agent's shift and rebuild roster rows
  updateAgentShift: (slotId: string, newStart: number, newEnd: number) => void

  // Inline per-day cell edit: update a single weekday cell in a rosterRow
  updateRosterCell: (slotId: string, weekday: string, value: string) => void

  // Overrides (for impact analysis)
  overrides: ScheduleOverride[]
  addOverride: (o: ScheduleOverride) => void
  removeOverride: (agentId: string, weekday: string) => void
  clearOverrides: () => void

  // Agent ↔ slot assignments  (slotId like "A1" → real agent id like "1")
  agentAssignments: Record<string, string>
  assignAgent: (slotId: string, realAgentId: string) => void
  unassignAgent: (slotId: string) => void

  // Schedule release (visible to agents in portal)
  released: boolean
  releaseRange: { from: string; to: string } | null   // ISO date strings e.g. "2026-03-16"
  releaseSchedule: (range: { from: string; to: string }) => void
  unrelease: () => void

  // Release history – every released schedule is appended here
  releaseHistory: ReleaseHistoryEntry[]
  archiveHistoryEntry: (id: string) => void
  deleteHistoryEntry: (id: string) => void

  // Generation state
  step: GenerationStep
  setStep: (s: GenerationStep) => void
  error: string | null
  setError: (e: string | null) => void

  // Reset
  reset: () => void
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set) => ({
      settings: DS,
      updateSettings: (partial) =>
        set((s) => ({ settings: { ...s.settings, ...partial } })),

      forecastRows: [],
      setForecast: (rows) => set({ forecastRows: rows }),

      requiredStaff: [],
      setRequiredStaff: (rows) => set({ requiredStaff: rows }),

      agents: [],
      rosterRows: [],
      breakRows: [],
      projections: [],

      setAgents: (agents) => set({ agents }),
      setRosterRows: (rows) => set({ rosterRows: rows }),
      setBreakRows: (rows) => set({ breakRows: rows }),
      setProjections: (rows) => set({ projections: rows }),

      updateAgentShift: (slotId, newStart, newEnd) =>
        set((s) => {
          const updatedAgents = s.agents.map((a) =>
            a.id === slotId ? { ...a, start: newStart, end: newEnd } : a,
          )
          return { agents: updatedAgents, rosterRows: buildRosterRows(updatedAgents) }
        }),

      updateRosterCell: (slotId, weekday, value) =>
        set((s) => ({
          rosterRows: s.rosterRows.map((r) =>
            r.agent === slotId ? { ...r, [weekday]: value } : r,
          ),
        })),

      overrides: [],
      addOverride: (o) =>
        set((s) => ({ overrides: [...s.overrides.filter(x => !(x.agentId === o.agentId && x.weekday === o.weekday)), o] })),
      removeOverride: (agentId, weekday) =>
        set((s) => ({ overrides: s.overrides.filter(x => !(x.agentId === agentId && x.weekday === weekday)) })),
      clearOverrides: () => set({ overrides: [] }),

      agentAssignments: {},
      assignAgent: (slotId, realAgentId) =>
        set((s) => ({ agentAssignments: { ...s.agentAssignments, [slotId]: realAgentId } })),
      unassignAgent: (slotId) =>
        set((s) => {
          const next = { ...s.agentAssignments }; delete next[slotId]; return { agentAssignments: next }
        }),

      released: false,
      releaseRange: null,
      releaseSchedule: (range) =>
        set((s) => {
          const entry: ReleaseHistoryEntry = {
            id: Date.now().toString(),
            releasedAt: new Date().toISOString(),
            range,
            agentCount: s.agents.length,
            projections: s.projections,
            status: 'released',
          }
          return {
            released: true,
            releaseRange: range,
            releaseHistory: [entry, ...s.releaseHistory],
          }
        }),
      unrelease: () => set({ released: false, releaseRange: null }),

      releaseHistory: [],
      archiveHistoryEntry: (id) =>
        set((s) => ({
          releaseHistory: s.releaseHistory.map((e) =>
            e.id === id ? { ...e, status: 'archived' as const } : e,
          ),
        })),
      deleteHistoryEntry: (id) =>
        set((s) => ({
          releaseHistory: s.releaseHistory.filter((e) => e.id !== id),
        })),

      step: 'idle',
      setStep: (step) => set({ step }),
      error: null,
      setError: (error) => set({ error }),

      reset: () =>
        set({
          forecastRows: [],
          requiredStaff: [],
          agents: [],
          rosterRows: [],
          breakRows: [],
          projections: [],
          overrides: [],
          agentAssignments: {},
          released: false,
          releaseRange: null,
          releaseHistory: [],
          step: 'idle',
          error: null,
        }),
    }),
    {
      // Scope storage key to the logged-in user so accounts never share data
      name: (() => {
        try {
          const auth = JSON.parse(localStorage.getItem('wfm-auth') ?? '{}')
          const userId = auth?.state?.user?.id
          return userId ? `wfm-schedule-${userId}` : 'wfm-schedule'
        } catch {
          return 'wfm-schedule'
        }
      })(),
      // Only persist what the agent portal needs; skip large/transient data
      partialize: (state) => ({
        settings:         state.settings,
        agents:           state.agents,
        rosterRows:       state.rosterRows,
        breakRows:        state.breakRows,
        agentAssignments: state.agentAssignments,
        released:         state.released,
        releaseRange:     state.releaseRange,
        releaseHistory:   state.releaseHistory,
      }),
    },
  ),
)
