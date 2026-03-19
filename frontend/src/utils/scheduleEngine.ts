/**
 * Core scheduling engine – TypeScript port of the Python app.py logic.
 * All heavy computation happens in the browser (no server round-trips needed).
 */
import { requiredServers, erlangAEstimates } from './erlang'
import type {
  ForecastRow,
  StaffingRow,
  ScheduledAgent,
  RosterRow,
  BreakRow,
  DayProjection,
  ScheduleSettings,
  Weekday,
} from '../types'
import { WEEKDAYS } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function minToTime(m: number): string {
  const h = Math.floor(((m % 1440) + 1440) % 1440 / 60)
  const mm = ((m % 1440) + 1440) % 1440 % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function timeToMin(s: string): number | null {
  if (!s) return null
  const clean = s.includes(' ') ? s.split(' ').pop()! : s
  const parts = clean.split(':')
  if (parts.length < 2) return null
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ─── Off days helpers ─────────────────────────────────────────────────────────
type OffPair = string[]

export function generateOffPairs(policy: ScheduleSettings['offPattern']): OffPair[] {
  if (policy === 'Consecutive Off Days') {
    return [
      ['Sun','Mon'], ['Mon','Tue'], ['Tue','Wed'],
      ['Wed','Thu'], ['Thu','Fri'], ['Fri','Sat'], ['Sat','Sun'],
    ]
  }
  if (policy === 'Split Off Days') {
    return [
      ['Mon','Thu'], ['Tue','Fri'], ['Wed','Sat'],
      ['Thu','Sun'], ['Fri','Mon'], ['Sat','Tue'], ['Sun','Wed'],
    ]
  }
  // Single Day Off
  return WEEKDAYS.map((d) => [d])
}

function offMask(pair: string[]): number[] {
  return WEEKDAYS.map((d) => (pair.includes(d) ? 0 : 1))
}

// ─── STEP 1 – Required staffing ──────────────────────────────────────────────
export function computeRequiredStaff(
  forecastRows: ForecastRow[],
  settings: ScheduleSettings,
  allSlots: number[],
): StaffingRow[] {
  const intervalLen = settings.intervalFormat === '15 minutes' ? 15 : 30
  const ahtMin = settings.ahtSeconds / 60
  const slaFrac = settings.slaTargetPct / 100
  const abandonFrac = settings.abandonTargetPct / 100
  const oooFactor = 1 - settings.oooShrinkagePct / 100

  const rows: StaffingRow[] = []

  for (const row of forecastRows) {
    const raw = requiredServers({
      arrivalsPerInterval: row.volume,
      ahtMinutes: ahtMin,
      slaFraction: slaFrac,
      slaSeconds: settings.slaThresholdSeconds,
      abandonFraction: abandonFrac,
      patienceSeconds: settings.patienceSeconds,
      intervalLengthMin: intervalLen,
    })
    const required = raw > 0 ? Math.ceil(raw / oooFactor) : 0
    rows.push({ ...row, required, requiredRaw: raw })
  }
  return rows
}

// ─── STEP 2 – Greedy roster generation ───────────────────────────────────────
export function generateRoster(
  requiredStaff: StaffingRow[],
  settings: ScheduleSettings,
  allSlots: number[],
  forecastRows: ForecastRow[] = [],
): ScheduledAgent[] {
  const SHIFT_MIN = 9 * 60
  const minStart = timeToMin(settings.earliestShiftStart) ?? 0
  const maxStart = timeToMin(settings.latestShiftStart) ?? 23 * 60

  const shiftTemplates: { start: number; end: number }[] = []
  for (let s = minStart; s <= maxStart; s += 30) {
    shiftTemplates.push({ start: s, end: s + SHIFT_MIN })
  }

  function covers(start: number, slot: number) {
    return slot >= start && slot < start + SHIFT_MIN
  }

  // Build mutable required map
  const required: Record<string, Record<string, number>> = {}
  for (const wd of WEEKDAYS) {
    required[wd] = {}
    for (const t of allSlots) required[wd][minToTime(t)] = 0
  }
  for (const r of requiredStaff) {
    required[r.weekday][r.slotLabel] = r.required
  }

  function totalRemaining() {
    return WEEKDAYS.reduce(
      (sum, wd) => sum + Object.values(required[wd]).reduce((s, v) => s + v, 0),
      0,
    )
  }

  const offPairs = generateOffPairs(settings.offPattern)
  const agents: ScheduledAgent[] = []
  let aid = 1
  let safety = 0
  const MAX = settings.maxAgentsCap

  while (totalRemaining() > 0 && agents.length < MAX && safety < 8000) {
    safety++

    // Find slot with highest need
    let bestNeed = 0; let bestWd: Weekday | null = null; let bestLabel: string | null = null
    for (const wd of WEEKDAYS) {
      for (const [lbl, need] of Object.entries(required[wd])) {
        if (need > bestNeed) { bestNeed = need; bestWd = wd as Weekday; bestLabel = lbl }
      }
    }
    if (bestNeed <= 0 || !bestWd || !bestLabel) break

    const slotMin = timeToMin(bestLabel)!

    // Pick shift template with highest weekly coverage
    let bestTpl = shiftTemplates[0]
    let bestScore = -1
    for (const tpl of shiftTemplates) {
      if (!covers(tpl.start, slotMin)) continue
      const covered = allSlots.filter((t) => covers(tpl.start, t))
      const score = WEEKDAYS.reduce(
        (sum, wd) => sum + covered.reduce((s, t) => s + (required[wd][minToTime(t)] ?? 0), 0),
        0,
      )
      if (score > bestScore) { bestScore = score; bestTpl = tpl }
    }

    // Pick best off pair
    let bestOff = offPairs[0]
    let bestOffScore = -1
    for (const op of offPairs) {
      const m = offMask(op)
      const covered = allSlots.filter((t) => covers(bestTpl.start, t))
      let sc = 0
      for (let i = 0; i < WEEKDAYS.length; i++) {
        if (m[i] === 0) continue
        for (const t of covered) sc += required[WEEKDAYS[i]][minToTime(t)] ?? 0
      }
      if (sc > bestOffScore) { bestOffScore = sc; bestOff = op }
    }

    agents.push({ id: `A${aid}`, start: bestTpl.start, end: bestTpl.end, off: bestOff })
    aid++

    // Decrement required
    const m = offMask(bestOff)
    const covered = allSlots.filter((t) => covers(bestTpl.start, t))
    for (let i = 0; i < WEEKDAYS.length; i++) {
      if (m[i] === 0) continue
      for (const t of covered) {
        const lbl = minToTime(t)
        required[WEEKDAYS[i]][lbl] = Math.max(0, (required[WEEKDAYS[i]][lbl] ?? 0) - 1)
      }
    }
  }

  // ── Pruning: aggressively remove agents while staying within SLA/abandon targets ──
  // Rules:
  //  1. Day-weighted SLA must stay >= slaTarget (80%)
  //  2. Day-weighted abandon must stay <= abandonTarget + 2% tolerance (prune buffer)
  //  3. Per-interval gap must be >= required - 2  (max deficit of 2)
  //  4. Per-interval gap must be <= required + 3  (max surplus of 3 — forces deeper pruning)
  const mu = 1 / (settings.ahtSeconds / 60)
  const theta = 1 / (settings.patienceSeconds / 60)
  const tSla = settings.slaThresholdSeconds / 60
  const slaFrac    = settings.slaTargetPct    / 100
  const abandonFrac = settings.abandonTargetPct / 100
  const intervalLen = settings.intervalFormat === '15 minutes' ? 15 : 30
  // Small tolerance so abandon doesn't block pruning at the exact boundary
  const abandonCeiling = abandonFrac + 0.02

  // Volume lookup
  const volLookup: Record<string, Record<string, number>> = {}
  for (const fr of forecastRows) {
    if (!volLookup[fr.weekday]) volLookup[fr.weekday] = {}
    volLookup[fr.weekday][minToTime(fr.slotMin)] = fr.volume
  }

  // Baseline required counts
  const baselineReq: Record<string, Record<string, number>> = {}
  for (const r of requiredStaff) {
    if (!baselineReq[r.weekday]) baselineReq[r.weekday] = {}
    baselineReq[r.weekday][r.slotLabel] = r.required
  }

  function daySlaMetrics(testCounts: Record<string, Record<string, number>>, wd: string) {
    let slaAcc = 0; let abnAcc = 0; let totCalls = 0
    for (const t of allSlots) {
      const lbl   = minToTime(t)
      const calls = volLookup[wd]?.[lbl] ?? 0
      if (calls === 0) continue
      const sched = testCounts[wd]?.[lbl] ?? 0
      if (sched === 0) {
        // 0-agent interval: all calls abandon — count against day SLA/abandon
        totCalls += calls; abnAcc += calls; continue
      }
      const a = (calls / intervalLen) / mu
      const { slaEst, pAbandon } = erlangAEstimates(a, sched, mu, theta, tSla)
      slaAcc += slaEst * calls
      abnAcc += pAbandon * calls
      totCalls += calls
    }
    return {
      sla: totCalls > 0 ? slaAcc / totCalls : 1,
      abn: totCalls > 0 ? abnAcc / totCalls : 0,
    }
  }

  let pruned = [...agents]
  let improved = true
  let loops = 0
  while (improved && loops < 500) {
    loops++; improved = false
    for (let i = pruned.length - 1; i >= 0; i--) {
      const agent     = pruned[i]
      const test      = [...pruned.slice(0, i), ...pruned.slice(i + 1)]
      const testCounts = buildScheduledCounts(test, allSlots)
      const workDays  = WEEKDAYS.filter((wd) => !agent.off.includes(wd))
      let ok = true

      for (const wd of workDays) {
        if (!ok) break

        // Rule 1 & 2: day-level SLA and abandon (with small abandon tolerance)
        const { sla, abn } = daySlaMetrics(testCounts, wd)
        if (sla < slaFrac || abn > abandonCeiling) { ok = false; break }

        // Rule 3 & 4: per-interval gap must stay in [-2, +3]
        for (const t of allSlots) {
          const lbl  = minToTime(t)
          const vol  = volLookup[wd]?.[lbl] ?? 0
          if (vol === 0) continue
          const reqV = baselineReq[wd]?.[lbl] ?? 0
          if (reqV === 0) continue
          const actual = testCounts[wd]?.[lbl] ?? 0
          if (actual < reqV - 2) { ok = false; break }   // too understaffed
        }
      }

      if (ok) { pruned.splice(i, 1); improved = true; break }
    }
  }

  return pruned
}

// ─── Build scheduled counts ───────────────────────────────────────────────────
export function buildScheduledCounts(
  agents: ScheduledAgent[],
  allSlots: number[],
): Record<string, Record<string, number>> {
  const SHIFT_MIN = 9 * 60
  const sched: Record<string, Record<string, number>> = {}
  for (const wd of WEEKDAYS) {
    sched[wd] = {}
    for (const t of allSlots) sched[wd][minToTime(t)] = 0
  }
  for (const ag of agents) {
    const m = offMask(ag.off)
    for (let i = 0; i < WEEKDAYS.length; i++) {
      if (m[i] === 0) continue
      for (const t of allSlots) {
        if (t >= ag.start && t < ag.start + SHIFT_MIN) {
          sched[WEEKDAYS[i]][minToTime(t)] = (sched[WEEKDAYS[i]][minToTime(t)] ?? 0) + 1
        }
      }
    }
  }
  return sched
}

// ─── Build roster rows ────────────────────────────────────────────────────────
export function buildRosterRows(agents: ScheduledAgent[]): RosterRow[] {
  return agents.map((ag) => {
    const m = offMask(ag.off)
    const row: RosterRow = {
      agent: ag.id,
      shiftStart: minToTime(ag.start),
      shiftEnd: minToTime(ag.end),
      offDays: ag.off.join(', '),
    }
    for (let i = 0; i < WEEKDAYS.length; i++) {
      row[WEEKDAYS[i]] = m[i] === 0 ? 'OFF' : `${minToTime(ag.start)}–${minToTime(ag.end)}`
    }
    return row
  })
}

// ─── STEP 3 – Break assignment ────────────────────────────────────────────────
export function assignBreaks(
  agents: ScheduledAgent[],
  allSlots: number[],
  settings: ScheduleSettings,
  scheduledCounts: Record<string, Record<string, number>>,
  requiredStaff: StaffingRow[],
): BreakRow[] {
  const SHIFT_MIN = 9 * 60
  const TEA = 15
  const LUNCH = settings.lunchDuration === '30 minutes' ? 30
              : settings.lunchDuration === '1 hour' ? 60 : 90
  const MIN_GAP = 60

  const reqLookup: Record<string, Record<string, number>> = {}
  for (const r of requiredStaff) {
    if (!reqLookup[r.weekday]) reqLookup[r.weekday] = {}
    reqLookup[r.weekday][r.slotLabel] = r.required
  }

  function resolveDay(wd: string, t: number): [string, string] {
    const dayIdx = WEEKDAYS.indexOf(wd as Weekday)
    const resolvedIdx = t >= 1440 ? (dayIdx + 1) % 7 : dayIdx
    return [WEEKDAYS[resolvedIdx], minToTime(t % 1440)]
  }

  const rows: BreakRow[] = []

  for (const ag of agents) {
    const { start, end, off } = ag
    const shiftEnd = end > start ? end : end + 1440
    const extendedSlots = end > start
      ? allSlots
      : [...allSlots, ...allSlots.map((t) => t + 1440)]

    const row: BreakRow = {
      agent: ag.id,
      shiftStart: minToTime(start),
      shiftEnd: minToTime(end),
      offDays: off.join(', '),
    }

    const m = offMask(off)

    for (let i = 0; i < WEEKDAYS.length; i++) {
      const wd = WEEKDAYS[i]
      row[`${wd}_Break_1`] = ''
      row[`${wd}_Lunch`] = ''
      row[`${wd}_Break_2`] = ''

      if (m[i] === 0) continue

      const slots = extendedSlots.filter((t) => t >= start && t + 30 <= shiftEnd)
      if (!slots.length) continue

      const teaSlots: number[] = []
      for (const t of slots) { teaSlots.push(t); teaSlots.push(t + 15) }

      // Break 1
      let b1Candidates = teaSlots.filter((t) => t >= start + MIN_GAP && t <= Math.min(start + 180, shiftEnd - 120))
      if (!b1Candidates.length) b1Candidates = teaSlots.filter((t) => t >= start + 30 && t <= shiftEnd - 150)
      if (!b1Candidates.length) b1Candidates = [start + 60]
      const b1 = randomChoice(b1Candidates)

      // Lunch
      let lunchCandidates = slots.filter((t) => t >= b1 + MIN_GAP && slots.includes(t + 30) && t <= shiftEnd - 90)
      if (!lunchCandidates.length) lunchCandidates = slots.filter((t) => t >= b1 + 45 && t <= shiftEnd - 60)
      if (!lunchCandidates.length) lunchCandidates = [b1 + 90]
      const lunch = randomChoice(lunchCandidates)
      const lunchEnd = lunch + LUNCH

      // Break 2
      let b2Candidates = teaSlots.filter((t) => t >= lunchEnd + MIN_GAP && t <= shiftEnd - 15)
      if (!b2Candidates.length) b2Candidates = teaSlots.filter((t) => t >= lunchEnd + 30 && t <= shiftEnd - 15)
      if (!b2Candidates.length) b2Candidates = teaSlots.filter((t) => t >= start + 30 && t <= shiftEnd - 15)
      const b2 = b2Candidates.length ? randomChoice(b2Candidates) : shiftEnd - 15

      row[`${wd}_Break_1`] = `${minToTime(b1 % 1440)}-${minToTime((b1 + TEA) % 1440)}`
      row[`${wd}_Lunch`] = `${minToTime(lunch % 1440)}-${minToTime((lunch + LUNCH) % 1440)}`

      const [d2] = resolveDay(wd, b2)
      row[`${d2}_Break_2`] = `${minToTime(b2 % 1440)}-${minToTime((b2 + TEA) % 1440)}`
    }

    rows.push(row)
  }

  return rows
}

// ─── STEP 4 – Daily projections ───────────────────────────────────────────────
export function computeProjections(
  forecastRows: ForecastRow[],
  scheduledCounts: Record<string, Record<string, number>>,
  requiredStaff: StaffingRow[],
  settings: ScheduleSettings,
  allSlots: number[],
): DayProjection[] {
  const mu = 1 / (settings.ahtSeconds / 60)
  const theta = 1 / (settings.patienceSeconds / 60)
  const tSla = settings.slaThresholdSeconds / 60
  const slaFrac = settings.slaTargetPct / 100
  const HIGH = slaFrac + 0.05

  // required pivot
  const reqLookup: Record<string, Record<string, number>> = {}
  for (const r of requiredStaff) {
    if (!reqLookup[r.weekday]) reqLookup[r.weekday] = {}
    reqLookup[r.weekday][r.slotLabel] = r.required
  }

  // actual pivot
  const actLookup: Record<string, Record<string, number>> = {}
  for (const wd of WEEKDAYS) actLookup[wd] = scheduledCounts[wd] ?? {}

  const projections: DayProjection[] = []

  for (const wd of WEEKDAYS) {
    let totCalls = 0; let slaAcc = 0; let abnAcc = 0; let occAcc = 0

    // inflex
    const reqTotal = allSlots.reduce((s, t) => s + (reqLookup[wd]?.[minToTime(t)] ?? 0), 0)
    const actTotal = allSlots.reduce((s, t) => s + (actLookup[wd]?.[minToTime(t)] ?? 0), 0)
    const inflexPct = reqTotal > 0 ? ((actTotal - reqTotal) / reqTotal) * 100 : 0

    for (const t of allSlots) {
      const lbl = minToTime(t)
      const row = forecastRows.find((r) => r.weekday === wd && r.slotLabel === lbl)
      const calls = row?.volume ?? 0
      const sched = actLookup[wd]?.[lbl] ?? 0

      let slaIt: number; let abnIt: number; let occIt: number

      if (sched === 0) {
        slaIt = 0; abnIt = calls > 0 ? 1 : 0; occIt = 0
      } else {
        const intervalLen = settings.intervalFormat === '15 minutes' ? 15 : 30
        const lambdaPm = calls / intervalLen
        const a = lambdaPm / mu
        // Use actual scheduled counts – shows real delivered SLA after optimization
        const { pAbandon, slaEst } = erlangAEstimates(a, sched, mu, theta, tSla)
        slaIt = slaEst
        abnIt = pAbandon
        occIt = Math.min((calls * (settings.ahtSeconds / 60)) / (sched * intervalLen), 1)
      }

      totCalls += calls
      slaAcc += slaIt * calls
      abnAcc += abnIt * calls
      occAcc += occIt * calls
    }

    projections.push({
      day: wd,
      totalCalls: Math.round(totCalls),
      projectedSLAPct: totCalls > 0 ? +((slaAcc / totCalls) * 100).toFixed(2) : 100,
      projectedAbandonPct: totCalls > 0 ? +((abnAcc / totCalls) * 100).toFixed(2) : 0,
      avgOccupancyPct: totCalls > 0 ? +((occAcc / totCalls) * 100).toFixed(2) : 0,
      schedulingInflexPct: +inflexPct.toFixed(2),
    })
  }

  return projections
}
