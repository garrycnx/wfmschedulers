import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ForecastResponse, ForecastRequest } from '../api/forecastApi'
import { format, addDays } from 'date-fns'

const today = new Date()
const defaultStart = format(addDays(today, 1), 'yyyy-MM-dd')
const defaultEnd = format(addDays(today, 30), 'yyyy-MM-dd')

interface ForecastStore {
  result: ForecastResponse | null
  isLoading: boolean
  error: string | null
  lastJobId: string | null

  // Persisted preferences
  preferredModel: string | null
  defaultStartDate: string
  defaultEndDate: string
  defaultModels: ForecastRequest['models']
  defaultCI: number[]
  defaultIntervalMinutes: 15 | 30

  // UI state
  selectedModel: string | null
  activeCI: '0.80' | '0.95'
  selectedDay: string | null   // selected date for interval chart

  setResult: (r: ForecastResponse) => void
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  setSelectedModel: (m: string) => void
  setPreferredModel: (m: string) => void
  setDefaultDates: (start: string, end: string) => void
  setDefaultModels: (models: ForecastRequest['models']) => void
  setActiveCI: (ci: '0.80' | '0.95') => void
  setSelectedDay: (d: string | null) => void
  reset: () => void
}

export const useForecastStore = create<ForecastStore>()(
  persist(
    (set) => ({
      result: null,
      isLoading: false,
      error: null,
      lastJobId: null,
      preferredModel: null,
      defaultStartDate: defaultStart,
      defaultEndDate: defaultEnd,
      defaultModels: ['prophet', 'arima', 'ets', 'ensemble'],
      defaultCI: [0.80, 0.95],
      defaultIntervalMinutes: 15,
      selectedModel: null,
      activeCI: '0.95',
      selectedDay: null,

      setResult: (r) => set({ result: r, lastJobId: r.job_id, selectedModel: r.best_model, selectedDay: r.startDate }),
      setLoading: (v) => set({ isLoading: v }),
      setError: (e) => set({ error: e }),
      setSelectedModel: (m) => set({ selectedModel: m }),
      setPreferredModel: (m) => set({ preferredModel: m }),
      setDefaultDates: (start, end) => set({ defaultStartDate: start, defaultEndDate: end }),
      setDefaultModels: (models) => set({ defaultModels: models }),
      setActiveCI: (ci) => set({ activeCI: ci }),
      setSelectedDay: (d) => set({ selectedDay: d }),
      reset: () => set({ result: null, isLoading: false, error: null }),
    }),
    {
      name: 'forecast-preferences',
      partialize: (state) => ({
        preferredModel: state.preferredModel,
        defaultStartDate: state.defaultStartDate,
        defaultEndDate: state.defaultEndDate,
        defaultModels: state.defaultModels,
        defaultCI: state.defaultCI,
        defaultIntervalMinutes: state.defaultIntervalMinutes,
      }),
    }
  )
)
