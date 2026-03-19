// ─── Auth ────────────────────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  name: string
  picture?: string
  role: 'admin' | 'manager' | 'agent' | 'viewer'
  organizationId?: string
  createdAt: string
}

// ─── Organization ────────────────────────────────────────────────────────────
export interface Organization {
  id: string
  name: string
  timezone: string
  createdAt: string
}

// ─── Line of Business ────────────────────────────────────────────────────────
export interface LineOfBusiness {
  id: string
  name: string
  description?: string
  color: string
  organizationId: string
  createdAt: string
  updatedAt: string
  _count?: { agents: number; schedules: number }
}

// ─── Agent ───────────────────────────────────────────────────────────────────
export type AgentStatus = 'active' | 'inactive' | 'on_leave'
export type SkillLevel = 'junior' | 'mid' | 'senior' | 'lead'

export interface Agent {
  id: string
  agentCode: string
  name: string
  email: string
  phone?: string
  status: AgentStatus
  skill: SkillLevel
  team?: string
  hireDate: string
  lobId?: string
  lob?: LineOfBusiness
  organizationId: string
  userId?: string
  createdAt: string
  updatedAt: string
}

export interface AgentFormData {
  name: string
  email: string
  phone?: string
  skill: SkillLevel
  team?: string
  hireDate: string
  status: AgentStatus
  employeeCode?: string
  lobId?: string
  password?: string
}

// ─── Schedule Settings ───────────────────────────────────────────────────────
export type IntervalFormat = '15 minutes' | '30 minutes'
export type OffPattern = 'Consecutive Off Days' | 'Split Off Days' | 'Single Day Off'
export type LunchDuration = '30 minutes' | '1 hour' | '1 hour 30 minutes'

export interface ScheduleSettings {
  ahtSeconds: number
  slaTargetPct: number
  slaThresholdSeconds: number
  abandonTargetPct: number
  patienceSeconds: number
  oooShrinkagePct: number
  offPattern: OffPattern
  lunchDuration: LunchDuration
  earliestShiftStart: string   // "HH:MM"
  latestShiftStart: string     // "HH:MM"
  maxAgentsCap: number
  intervalFormat: IntervalFormat
}

export const DEFAULT_SETTINGS: ScheduleSettings = {
  ahtSeconds: 360,
  slaTargetPct: 80,
  slaThresholdSeconds: 20,
  abandonTargetPct: 5,
  patienceSeconds: 120,
  oooShrinkagePct: 15,
  offPattern: 'Consecutive Off Days',
  lunchDuration: '1 hour',
  earliestShiftStart: '00:00',
  latestShiftStart: '23:00',
  maxAgentsCap: 800,
  intervalFormat: '30 minutes',
}

// ─── Forecast ────────────────────────────────────────────────────────────────
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export type Weekday = typeof WEEKDAYS[number]

export interface ForecastRow {
  weekday: Weekday
  slotMin: number
  slotLabel: string
  volume: number
}

export type ForecastPivot = Record<string, Record<Weekday, number>>

// ─── Staffing ────────────────────────────────────────────────────────────────
export interface StaffingRow {
  weekday: Weekday
  slotMin: number
  slotLabel: string
  required: number
  requiredRaw: number
}

// ─── Scheduled Agent ─────────────────────────────────────────────────────────
export interface ScheduledAgent {
  id: string
  agentId?: string            // linked real agent
  start: number               // minutes from midnight
  end: number
  off: string[]               // weekdays as 'Mon', 'Tue', etc.
}

export interface RosterRow {
  agent: string
  shiftStart: string
  shiftEnd: string
  offDays: string
  [weekday: string]: string   // Mon–Sun: "HH:MM–HH:MM" | "OFF"
}

export interface BreakRow {
  agent: string
  shiftStart: string
  shiftEnd: string
  offDays: string
  [key: string]: string       // {Day}_Break_1, {Day}_Lunch, {Day}_Break_2
}

// ─── Projections ─────────────────────────────────────────────────────────────
export interface DayProjection {
  day: string
  totalCalls: number
  projectedSLAPct: number
  projectedAbandonPct: number
  avgOccupancyPct: number
  schedulingInflexPct: number
}

// ─── Saved Schedule ──────────────────────────────────────────────────────────
export interface SavedSchedule {
  id: string
  name: string
  weekStartDate: string
  settings: ScheduleSettings
  forecast: ForecastRow[]
  requiredStaff: StaffingRow[]
  agents: ScheduledAgent[]
  projections: DayProjection[]
  createdBy: string
  organizationId: string
  createdAt: string
  updatedAt: string
  status: 'draft' | 'published' | 'archived'
}

// ─── Impact Analysis ─────────────────────────────────────────────────────────
export interface ScheduleOverride {
  agentId: string
  weekday: Weekday
  type: 'add_shift' | 'remove_shift' | 'change_time' | 'add_off' | 'remove_off'
  originalValue?: string
  newValue?: string
}

export interface ImpactResult {
  weekday: Weekday
  slotLabel: string
  before: number
  after: number
  delta: number
  meetsRequirement: boolean
}

// ─── Dashboard KPIs ──────────────────────────────────────────────────────────
export interface DashboardKPIs {
  totalAgents: number
  activeSchedules: number
  avgSLA: number
  avgOccupancy: number
  avgAbandon: number
  schedulingInflex: number
}
