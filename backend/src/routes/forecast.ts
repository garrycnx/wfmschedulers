import { Router, Request, Response } from 'express'
import axios, { AxiosError } from 'axios'
import { requireAuth } from '../middleware/auth'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
const FORECAST_URL = process.env.FORECAST_SERVICE_URL || 'http://localhost:8001'

// ─── Banking call center 15-min interval distribution ─────────────────────
// Each entry: [time_label, pct_of_daily_volume]
// Represents a typical banking contact center (8:00 AM – 7:45 PM, 48 slots)
const INTERVAL_DISTRIBUTION_15: Array<[string, number]> = [
  ['08:00', 0.0115], ['08:15', 0.0135], ['08:30', 0.0175], ['08:45', 0.0200],
  ['09:00', 0.0285], ['09:15', 0.0310], ['09:30', 0.0355], ['09:45', 0.0380],
  ['10:00', 0.0395], ['10:15', 0.0405], ['10:30', 0.0385], ['10:45', 0.0375],
  ['11:00', 0.0360], ['11:15', 0.0355], ['11:30', 0.0315], ['11:45', 0.0300],
  ['12:00', 0.0250], ['12:15', 0.0235], ['12:30', 0.0210], ['12:45', 0.0205],
  ['13:00', 0.0225], ['13:15', 0.0240], ['13:30', 0.0290], ['13:45', 0.0315],
  ['14:00', 0.0335], ['14:15', 0.0350], ['14:30', 0.0365], ['14:45', 0.0380],
  ['15:00', 0.0375], ['15:15', 0.0360], ['15:30', 0.0325], ['15:45', 0.0300],
  ['16:00', 0.0265], ['16:15', 0.0240], ['16:30', 0.0195], ['16:45', 0.0180],
  ['17:00', 0.0135], ['17:15', 0.0125], ['17:30', 0.0085], ['17:45', 0.0075],
  ['18:00', 0.0050], ['18:15', 0.0040], ['18:30', 0.0032], ['18:45', 0.0025],
  ['19:00', 0.0020], ['19:15', 0.0016], ['19:30', 0.0012], ['19:45', 0.0008],
]
// Normalize to sum to exactly 1.0
const DIST_15_TOTAL = INTERVAL_DISTRIBUTION_15.reduce((s, [, p]) => s + p, 0)
const NORM_DIST_15 = INTERVAL_DISTRIBUTION_15.map(([t, p]): [string, number] => [t, p / DIST_15_TOTAL])

// Build 30-min version by summing pairs of 15-min slots
const NORM_DIST_30: Array<[string, number]> = []
for (let i = 0; i < NORM_DIST_15.length; i += 2) {
  const t = NORM_DIST_15[i][0]
  const p = (NORM_DIST_15[i]?.[1] ?? 0) + (NORM_DIST_15[i + 1]?.[1] ?? 0)
  NORM_DIST_30.push([t, p])
}

const DOW_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isServiceDown(err: unknown): boolean {
  const e = err as AxiosError
  return (
    e.code === 'ECONNREFUSED' ||
    e.code === 'ENOTFOUND' ||
    e.code === 'ETIMEDOUT' ||
    e.code === 'ECONNRESET' ||
    (e.response?.status !== undefined && e.response.status >= 502 && e.response.status <= 504)
  )
}

function handleProxyError(err: unknown, res: Response): void {
  const e = err as AxiosError
  if (e.response) {
    res.status(e.response.status).json(e.response.data)
    return
  }
  console.error('[forecast-proxy] Unexpected error:', err)
  res.status(500).json({ error: 'Internal proxy error' })
}

// ─── Fallback Forecast Engine ─────────────────────────────────────────────────

interface DailyRecord { date: Date; calls: number }

interface IntervalRecord15 { date: string; time: string; calls: number }

async function fetch15MinData(): Promise<IntervalRecord15[] | null> {
  try {
    const { data } = await axios.get<IntervalRecord15[]>(
      'https://bank-api-pnp9.onrender.com/data/15min',
      { timeout: 15000 }
    )
    if (Array.isArray(data) && data.length > 0) return data
    return null
  } catch {
    return null
  }
}

function aggregate15MinToDaily(intervals: IntervalRecord15[]): DailyRecord[] {
  const byDate = new Map<string, number>()
  for (const item of intervals) {
    const date = item.date?.split('T')[0] ?? ''
    if (!date) continue
    byDate.set(date, (byDate.get(date) ?? 0) + (Number(item.calls) || 0))
  }
  return Array.from(byDate.entries())
    .map(([dateStr, calls]) => ({ date: new Date(dateStr), calls }))
    .filter(d => !isNaN(d.date.getTime()) && d.calls >= 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

async function fetchHistoricalData(): Promise<DailyRecord[]> {
  // Try 15-min endpoint first (richer data)
  const interval15 = await fetch15MinData()
  if (interval15) {
    const daily = aggregate15MinToDaily(interval15)
    if (daily.length >= 30) {
      console.log(`[forecast-fallback] Using 15-min historical data: ${daily.length} days`)
      return daily
    }
  }

  // Fall back to daily endpoint
  const { data } = await axios.get<Array<{ date: string; total_calls: number }>>(
    'https://bank-api-pnp9.onrender.com/data',
    { timeout: 15000 }
  )
  const records = data
    .map(d => ({ date: new Date(d.date), calls: Number(d.total_calls) || 0 }))
    .filter(d => !isNaN(d.date.getTime()) && d.calls >= 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  // Fill gaps
  const filled: DailyRecord[] = []
  for (let i = 0; i < records.length; i++) {
    filled.push(records[i])
    if (i < records.length - 1) {
      const gap = Math.round((records[i + 1].date.getTime() - records[i].date.getTime()) / 86400000) - 1
      for (let g = 1; g <= gap; g++) {
        const d = new Date(records[i].date.getTime() + g * 86400000)
        // Linear interpolation
        const frac = g / (gap + 1)
        const calls = records[i].calls * (1 - frac) + records[i + 1].calls * frac
        filled.push({ date: d, calls: Math.round(calls) })
      }
    }
  }
  return filled
}

function computeDowWeights(records: DailyRecord[]): Record<number, number> {
  // Use last 8 weeks (56 days)
  const recent = records.slice(-56)
  const sums: Record<number, number> = { 0:0,1:0,2:0,3:0,4:0,5:0,6:0 }
  const counts: Record<number, number> = { 0:0,1:0,2:0,3:0,4:0,5:0,6:0 }
  for (const r of recent) {
    const dow = r.date.getDay()
    sums[dow] += r.calls
    counts[dow]++
  }
  const means: Record<number, number> = {}
  const overall = Object.keys(sums).reduce((s, k) => s + (counts[+k] ? sums[+k] / counts[+k] : 0), 0) / 7
  for (let d = 0; d < 7; d++) {
    means[d] = counts[d] ? (sums[d] / counts[d]) / Math.max(1, overall) : 1.0
  }
  return means
}

function computeTrend(records: DailyRecord[]): number {
  const recent = records.slice(-90)
  if (recent.length < 14) return 0
  const n = recent.length
  const xMean = (n - 1) / 2
  const yMean = recent.reduce((s, r) => s + r.calls, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (recent[i].calls - yMean)
    den += (i - xMean) ** 2
  }
  return den > 0 ? num / den : 0
}

function movingAvg(records: DailyRecord[], window: number): number {
  const slice = records.slice(-window)
  return slice.reduce((s, r) => s + r.calls, 0) / slice.length
}

function weightedMovingAvg(records: DailyRecord[]): number {
  const ma7  = movingAvg(records, 7)
  const ma14 = movingAvg(records, 14)
  const ma28 = movingAvg(records, Math.min(28, records.length))
  return 0.60 * ma7 + 0.25 * ma14 + 0.15 * ma28
}

function dateToString(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000)
}

function parseDateSafe(s: string): Date {
  const d = new Date(s)
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${s}`)
  return d
}

interface ForecastDay {
  date: string
  calls: number
  dow: number
}

function generateDailyForecast(
  history: DailyRecord[],
  startDate: Date,
  endDate: Date
): ForecastDay[] {
  const dowWeights = computeDowWeights(history)
  const trend = computeTrend(history)
  const baseMA = weightedMovingAvg(history)

  const days: ForecastDay[] = []
  let current = new Date(startDate)
  let idx = 0

  while (current <= endDate) {
    const dow = current.getDay()
    const trended = baseMA + trend * idx
    const withDow = Math.max(0, trended * (dowWeights[dow] ?? 1.0))
    days.push({ date: dateToString(current), calls: Math.round(withDow), dow })
    current = addDays(current, 1)
    idx++
  }
  return days
}

function computeBootstrapCI(
  days: ForecastDay[],
  history: DailyRecord[],
  level80: number,
  level95: number
): Array<{ ci_lower_80: number; ci_upper_80: number; ci_lower_95: number; ci_upper_95: number }> {
  // Use std of last 30 days residuals as noise
  const last30 = history.slice(-30).map(r => r.calls)
  const mean30 = last30.reduce((s, v) => s + v, 0) / last30.length
  const std30 = Math.sqrt(last30.reduce((s, v) => s + (v - mean30) ** 2, 0) / last30.length)

  return days.map((d, i) => {
    const growingUncertainty = 1 + i * 0.02   // uncertainty grows with horizon
    const sigma = std30 * growingUncertainty
    const z80 = 1.282
    const z95 = 1.960
    return {
      ci_lower_80: Math.max(0, Math.round(d.calls - z80 * sigma)),
      ci_upper_80: Math.max(0, Math.round(d.calls + z80 * sigma)),
      ci_lower_95: Math.max(0, Math.round(d.calls - z95 * sigma)),
      ci_upper_95: Math.max(0, Math.round(d.calls + z95 * sigma)),
    }
  })
}

function distributeToIntervals(
  dailyForecast: ForecastDay[],
  intervalMinutes: 15 | 30
): Array<{ date: string; time: string; dayOfWeek: string; calls: number; isWeekend: boolean }> {
  const dist = intervalMinutes === 15 ? NORM_DIST_15 : NORM_DIST_30
  const result = []

  for (const day of dailyForecast) {
    const dow = day.dow
    const isWeekend = dow === 0 || dow === 6
    // Weekends have lower volume — apply a 35% reduction
    const dailyCalls = isWeekend ? day.calls * 0.65 : day.calls

    for (const [time, pct] of dist) {
      result.push({
        date: day.date,
        time,
        dayOfWeek: DOW_NAMES[dow].charAt(0).toUpperCase() + DOW_NAMES[dow].slice(1),
        calls: Math.round(dailyCalls * pct),
        isWeekend,
      })
    }
  }
  return result
}

function buildDowPattern(intervalData: ReturnType<typeof distributeToIntervals>, timeSlots: string[]): Record<string, number[]> {
  const pattern: Record<string, number[]> = {}
  const counts: Record<string, number> = {}

  for (const item of intervalData) {
    const key = item.dayOfWeek.toLowerCase()
    if (!pattern[key]) {
      pattern[key] = new Array(timeSlots.length).fill(0)
      counts[key] = 0
    }
    const slotIdx = timeSlots.indexOf(item.time)
    if (slotIdx >= 0) {
      pattern[key][slotIdx] += item.calls
    }
  }

  // Average by day count
  for (const [dow, dayCount] of Object.entries(counts)) {
    if (dayCount > 0) {
      pattern[dow] = pattern[dow].map(v => Math.round(v / dayCount))
    }
  }

  return pattern
}

function buildDistributionTable(
  dailyForecast: ForecastDay[],
  horizon: number
): Array<{ date_range: string; forecast_total: number; interval_type: string; allocation_pct: number; status: string }> {
  const total = dailyForecast.reduce((s, d) => s + d.calls, 0)

  if (horizon <= 14) {
    return dailyForecast.map(d => {
      const date = new Date(d.date)
      return {
        date_range: d.date,
        forecast_total: d.calls,
        interval_type: 'Daily',
        allocation_pct: total > 0 ? Math.round(d.calls / total * 10000) / 100 : 0,
        status: 'Projected',
      }
    })
  } else if (horizon <= 60) {
    // Weekly groups
    const weeks: Record<string, { label: string; total: number }> = {}
    for (const d of dailyForecast) {
      const dt = new Date(d.date)
      const dayOfWeek = dt.getDay()
      const monday = new Date(dt.getTime() - ((dayOfWeek === 0 ? 6 : dayOfWeek - 1) * 86400000))
      const weekEnd = new Date(monday.getTime() + 6 * 86400000)
      const key = dateToString(monday)
      if (!weeks[key]) {
        const m = monday.toLocaleString('en-US', { month:'short', day:'numeric' })
        const e = weekEnd.toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric' })
        weeks[key] = { label: `${m} – ${e}`, total: 0 }
      }
      weeks[key].total += d.calls
    }
    return Object.entries(weeks).map(([, w]) => ({
      date_range: w.label,
      forecast_total: Math.round(w.total),
      interval_type: 'Weekly',
      allocation_pct: total > 0 ? Math.round(w.total / total * 10000) / 100 : 0,
      status: 'Projected',
    }))
  } else {
    // Monthly groups
    const months: Record<string, number> = {}
    for (const d of dailyForecast) {
      const dt = new Date(d.date)
      const key = dt.toLocaleString('en-US', { month:'long', year:'numeric' })
      months[key] = (months[key] ?? 0) + d.calls
    }
    return Object.entries(months).map(([label, total_m]) => ({
      date_range: label,
      forecast_total: Math.round(total_m),
      interval_type: 'Monthly',
      allocation_pct: total > 0 ? Math.round(total_m / total * 10000) / 100 : 0,
      status: 'Projected',
    }))
  }
}

function detectSeasonality(history: DailyRecord[]): Array<{ period: string; strength: number; peak_day_or_month: string; description: string }> {
  const DOW_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const MONTH_LABELS = ['', 'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const recent = history.slice(-56)
  const dowSums: number[] = [0,0,0,0,0,0,0]
  const dowCounts: number[] = [0,0,0,0,0,0,0]
  for (const r of recent) {
    const d = r.date.getDay()
    dowSums[d] += r.calls
    dowCounts[d]++
  }
  const dowAvg = dowSums.map((s, i) => dowCounts[i] ? s / dowCounts[i] : 0)
  const maxDow = Math.max(...dowAvg)
  const minDow = Math.min(...dowAvg.filter(v => v > 0))
  const meanDow = dowAvg.reduce((s, v) => s + v, 0) / dowAvg.length
  const weeklyStrength = meanDow > 0 ? (maxDow - minDow) / meanDow : 0
  const peakDow = dowAvg.indexOf(maxDow)

  // Monthly
  const monthSums: Record<number, number> = {}
  const monthCounts: Record<number, number> = {}
  for (const r of history) {
    const m = r.date.getMonth() + 1
    monthSums[m] = (monthSums[m] ?? 0) + r.calls
    monthCounts[m] = (monthCounts[m] ?? 0) + 1
  }
  const monthAvg: Record<number, number> = {}
  for (let m = 1; m <= 12; m++) {
    monthAvg[m] = monthCounts[m] ? monthSums[m] / monthCounts[m] : 0
  }
  const maxMonth = Math.max(...Object.values(monthAvg))
  const minMonth = Math.min(...Object.values(monthAvg).filter(v => v > 0))
  const meanMonth = Object.values(monthAvg).reduce((s, v) => s + v, 0) / 12
  const monthlyStrength = meanMonth > 0 ? (maxMonth - minMonth) / meanMonth : 0
  let peakMonthNum = 1
  let peakMonthVal = 0
  for (const [k, v] of Object.entries(monthAvg)) {
    if (v > peakMonthVal) { peakMonthVal = v; peakMonthNum = +k }
  }

  return [
    {
      period: 'weekly',
      strength: Math.min(1, Math.round(weeklyStrength * 1000) / 1000),
      peak_day_or_month: DOW_LABELS[peakDow],
      description: `Peak on ${DOW_LABELS[peakDow]}. Weekly variation: ±${(weeklyStrength * 50).toFixed(1)}% from average.`,
    },
    {
      period: 'monthly',
      strength: Math.min(1, Math.round(monthlyStrength * 1000) / 1000),
      peak_day_or_month: MONTH_LABELS[peakMonthNum] ?? 'Jan',
      description: `Peak month: ${MONTH_LABELS[peakMonthNum] ?? 'Jan'}. Monthly variation: ±${(monthlyStrength * 50).toFixed(1)}%.`,
    },
  ]
}

function buildInsights(
  history: DailyRecord[],
  dailyForecast: ForecastDay[]
): Array<{ type: string; title: string; detail: string; severity: string }> {
  const insights = []

  // Trend
  const last30avg = history.slice(-30).reduce((s, r) => s + r.calls, 0) / 30
  const prior30avg = history.slice(-60, -30).reduce((s, r) => s + r.calls, 0) / 30
  const pctChange = prior30avg > 0 ? ((last30avg - prior30avg) / prior30avg) * 100 : 0
  const direction = pctChange >= 0 ? 'increase' : 'decrease'
  insights.push({
    type: 'trend',
    title: `Recent Trend: ${Math.abs(pctChange).toFixed(1)}% ${direction}`,
    detail: `Call volumes ${direction}d by ${Math.abs(pctChange).toFixed(1)}% over the last 30 days vs the prior 30 days.`,
    severity: Math.abs(pctChange) > 10 ? 'warning' : 'info',
  })

  // Forecast direction
  const forecastAvg = dailyForecast.reduce((s, d) => s + d.calls, 0) / dailyForecast.length
  const delta = last30avg > 0 ? ((forecastAvg - last30avg) / last30avg) * 100 : 0
  insights.push({
    type: 'trend',
    title: `Forecast: ${Math.abs(delta).toFixed(1)}% ${delta >= 0 ? 'above' : 'below'} current average`,
    detail: `The ${dailyForecast.length}-day forecast average (${Math.round(forecastAvg).toLocaleString()} calls/day) is ${Math.abs(delta).toFixed(1)}% ${delta >= 0 ? 'above' : 'below'} the last 30-day average (${Math.round(last30avg).toLocaleString()} calls/day).`,
    severity: 'info',
  })

  // Model note
  insights.push({
    type: 'recommendation',
    title: 'Fallback Mode: MA Ensemble Active',
    detail: 'The Python forecast service is not running. The built-in MA Ensemble model is being used. Start the forecast service to access Prophet, ARIMA, ETS, and LSTM models.',
    severity: 'warning',
  })

  return insights
}

// ─── Main fallback forecast generator ────────────────────────────────────────

async function generateFallbackForecast(body: {
  startDate: string
  endDate: string
  intervalMinutes?: number
}): Promise<object> {
  const start = parseDateSafe(body.startDate)
  const end = parseDateSafe(body.endDate)
  const intervalMinutes = (body.intervalMinutes === 30 ? 30 : 15) as 15 | 30

  const diffMs = end.getTime() - start.getTime()
  const horizon = Math.max(1, Math.round(diffMs / 86400000) + 1)

  console.log('[forecast-fallback] Fetching historical data...')
  const history = await fetchHistoricalData()
  if (history.length < 30) throw new Error('Insufficient historical data for forecasting')

  console.log(`[forecast-fallback] Generating ${horizon}-day forecast (${intervalMinutes}-min intervals)`)

  const dailyForecast = generateDailyForecast(history, start, end)
  const ciData = computeBootstrapCI(dailyForecast, history, 0.80, 0.95)

  const dist = intervalMinutes === 15 ? NORM_DIST_15 : NORM_DIST_30
  const timeSlots = dist.map(([t]) => t)

  const intervalData = distributeToIntervals(dailyForecast, intervalMinutes)
  const dowPattern = buildDowPattern(intervalData, timeSlots)
  const distribution = buildDistributionTable(dailyForecast, horizon)
  const seasonality = detectSeasonality(history)
  const insights = buildInsights(history, dailyForecast)

  // Historical data: last 90 days
  const historicalData = history.slice(-90).map(r => ({
    date: dateToString(r.date),
    value: r.calls,
    is_forecast: false,
  }))

  const forecastPoints = dailyForecast.map((d, i) => ({
    date: d.date,
    value: d.calls,
    ci_lower_80: ciData[i].ci_lower_80,
    ci_upper_80: ciData[i].ci_upper_80,
    ci_lower_95: ciData[i].ci_lower_95,
    ci_upper_95: ciData[i].ci_upper_95,
    is_forecast: true,
  }))

  return {
    job_id: uuidv4(),
    status: 'completed',
    startDate: body.startDate,
    endDate: body.endDate,
    horizon,
    intervalMinutes,
    generated_at: new Date().toISOString(),
    model_results: {
      ensemble: {
        model_name: 'ensemble',
        model_display_name: 'Moving Average Ensemble (Fallback)',
        description: 'Built-in MA+trend+DOW forecast. Start the Python service for Prophet, ARIMA, ETS, LSTM models.',
        forecast: forecastPoints,
        metrics: { mape: 0, rmse: 0, mae: 0 },
        recommendation_score: 75,
        training_time_seconds: 0.1,
        params_used: { windows: [7, 14, 28], weights: [0.6, 0.25, 0.15], note: 'fallback mode' },
      },
    },
    historical_data: historicalData,
    seasonality,
    distribution,
    insights,
    best_model: 'ensemble',
    interval_data: intervalData,
    dow_pattern: dowPattern,
    interval_time_slots: timeSlots,
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/models', requireAuth, async (req: Request, res: Response) => {
  try {
    const up = await axios.get(`${FORECAST_URL}/api/forecast/models`)
    res.status(up.status).json(up.data)
  } catch (err) {
    if (isServiceDown(err)) {
      res.json({
        models: [
          { id: 'ensemble', display_name: 'Moving Average Ensemble (Fallback)', description: 'Built-in fallback model. Start Python service for full model suite.', accuracy_metrics: 'MAPE, RMSE, MAE' },
        ],
      })
    } else { handleProxyError(err, res) }
  }
})

router.post('/generate', requireAuth, async (req: Request, res: Response) => {
  // Try Python service first
  try {
    const up = await axios.post(`${FORECAST_URL}/api/forecast/generate`, req.body, {
      timeout: 300000,
      headers: { 'Content-Type': 'application/json' },
    })
    res.status(up.status).json(up.data)
    return
  } catch (err) {
    if (!isServiceDown(err)) { handleProxyError(err, res); return }
    console.log('[forecast-proxy] Python service down — using built-in fallback forecast engine')
  }

  // Fallback: built-in TypeScript forecast
  try {
    const result = await generateFallbackForecast(req.body)
    res.json(result)
  } catch (fallbackErr) {
    console.error('[forecast-fallback] Fallback also failed:', fallbackErr)
    res.status(500).json({
      error: 'Forecast generation failed (both Python service and fallback engine)',
      detail: (fallbackErr as Error).message,
    })
  }
})

router.get('/result/:jobId', requireAuth, async (req: Request, res: Response) => {
  const { jobId } = req.params
  try {
    const up = await axios.get(`${FORECAST_URL}/api/forecast/result/${jobId}`)
    res.status(up.status).json(up.data)
  } catch (err) {
    if (isServiceDown(err)) {
      res.status(404).json({ error: 'Python service not available. Results only stored in memory — re-run the forecast.' })
    } else { handleProxyError(err, res) }
  }
})

router.get('/history', requireAuth, async (req: Request, res: Response) => {
  const days = req.query.days as string | undefined
  try {
    const up = await axios.get(`${FORECAST_URL}/api/forecast/history${days ? `?days=${days}` : ''}`)
    res.status(up.status).json(up.data)
  } catch (err) {
    if (isServiceDown(err)) {
      // Fallback: fetch directly from bank API
      try {
        const { data } = await axios.get<Array<{ date: string; total_calls: number }>>(
          'https://bank-api-pnp9.onrender.com/data', { timeout: 15000 }
        )
        const daysNum = days ? parseInt(days) : 90
        const sorted = data.sort((a, b) => a.date.localeCompare(b.date)).slice(-daysNum)
        res.json({ data: sorted.map(d => ({ date: d.date, value: d.total_calls, is_forecast: false })), count: sorted.length })
      } catch (fe) {
        res.status(503).json({ error: 'Could not fetch historical data', detail: (fe as Error).message })
      }
    } else { handleProxyError(err, res) }
  }
})

router.get('/export/:jobId', requireAuth, async (req: Request, res: Response) => {
  const { jobId } = req.params
  const format = req.query.format as string | undefined
  try {
    const up = await axios.get(`${FORECAST_URL}/api/forecast/export/${jobId}${format ? `?format=${format}` : ''}`, { responseType: 'stream' })
    const ct = up.headers['content-type']
    const cd = up.headers['content-disposition']
    if (ct) res.setHeader('Content-Type', ct)
    if (cd) res.setHeader('Content-Disposition', cd)
    res.status(up.status)
    up.data.pipe(res)
  } catch (err) {
    if (isServiceDown(err)) {
      res.status(503).json({ error: 'Export not available — Python service is not running' })
    } else { handleProxyError(err, res) }
  }
})

router.post('/refresh-cache', requireAuth, async (req: Request, res: Response) => {
  try {
    const up = await axios.post(`${FORECAST_URL}/api/forecast/refresh-cache`)
    res.status(up.status).json(up.data)
  } catch (err) {
    if (isServiceDown(err)) {
      res.json({ message: 'Cache cleared (Python service not running — nothing to clear)' })
    } else { handleProxyError(err, res) }
  }
})

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const up = await axios.get(`${FORECAST_URL}/health`, { timeout: 5000 })
    res.status(up.status).json({ ...up.data, fallback_available: true })
  } catch {
    res.json({ status: 'degraded', python_service: 'down', fallback_available: true })
  }
})

export default router
