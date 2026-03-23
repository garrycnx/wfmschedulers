import { apiClient } from './client'

const FORECAST_BASE = '/forecast'

export interface ForecastRequest {
  startDate: string             // "2026-03-25"
  endDate: string               // "2026-04-24"
  models: Array<'prophet' | 'arima' | 'ets' | 'lstm' | 'ensemble'>
  confidence_intervals: number[]
  intervalMinutes: 15 | 30
  historicalDays?: number       // how many days of history to train on (undefined = all)
}

export interface HistoricalRange {
  minDate: string    // "2025-10-03"
  maxDate: string    // "2026-03-23"
  totalDays: number  // 172
}

export interface ForecastPoint {
  date: string
  value: number
  ci_lower_80?: number
  ci_upper_80?: number
  ci_lower_95?: number
  ci_upper_95?: number
  is_forecast: boolean
}

export interface HistoricalPoint {
  date: string
  value: number
  is_forecast: boolean
}

export interface ModelMetrics {
  mape: number
  rmse: number
  mae: number
  aic?: number
  bic?: number
}

export interface ModelResult {
  model_name: string
  model_display_name: string
  description: string
  forecast: ForecastPoint[]
  metrics: ModelMetrics
  recommendation_score: number
  training_time_seconds: number
  params_used: Record<string, unknown>
}

export interface SeasonalityPattern {
  period: string
  strength: number
  peak_day_or_month: string
  description: string
}

export interface DistributionRow {
  date_range: string
  forecast_total: number
  interval_type: string
  allocation_pct: number
  status: string
}

export interface InsightItem {
  type: string
  title: string
  detail: string
  severity: 'info' | 'warning' | 'success'
}

export interface IntervalDataPoint {
  date: string          // "2026-03-25"
  time: string          // "09:30"
  dayOfWeek: string     // "Monday"
  calls: number
  isWeekend: boolean
}

export interface DowPattern {
  [dow: string]: number[]   // "monday" → [calls at each interval slot]
}

export interface ForecastResponse {
  job_id: string
  status: string
  startDate: string
  endDate: string
  horizon: number
  intervalMinutes: number
  generated_at: string
  model_results: Record<string, ModelResult>
  historical_data: HistoricalPoint[]
  seasonality: SeasonalityPattern[]
  distribution: DistributionRow[]
  insights: InsightItem[]
  best_model: string
  interval_data: IntervalDataPoint[]
  dow_pattern: DowPattern
  interval_time_slots: string[]   // ["08:00","08:30",...]
}

export interface AvailableModel {
  id: string
  display_name: string
  description: string
  accuracy_metrics: string
}

export const forecastApi = {
  getModels: async (): Promise<AvailableModel[]> => {
    const { data } = await apiClient.get(`${FORECAST_BASE}/models`)
    return data.models
  },

  generate: async (request: ForecastRequest): Promise<ForecastResponse> => {
    const { data } = await apiClient.post(`${FORECAST_BASE}/generate`, request, {
      timeout: 300000,
    })
    return data
  },

  getResult: async (jobId: string): Promise<ForecastResponse> => {
    const { data } = await apiClient.get(`${FORECAST_BASE}/result/${jobId}`)
    return data
  },

  getHistory: async (days = 90): Promise<HistoricalPoint[]> => {
    const { data } = await apiClient.get(`${FORECAST_BASE}/history?days=${days}`)
    return data.data
  },

  getExportUrl: (jobId: string, format: 'csv' | 'json' | 'excel') =>
    `/api${FORECAST_BASE}/export/${jobId}?format=${format}`,

  refreshCache: async () => {
    const { data } = await apiClient.post(`${FORECAST_BASE}/refresh-cache`)
    return data
  },

  getHistoricalRange: async (): Promise<HistoricalRange> => {
    const { data } = await apiClient.get(`${FORECAST_BASE}/historical-range`, { timeout: 55000 })
    return data
  },
}
