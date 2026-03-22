import { useState, useMemo } from 'react'
import { Zap, Settings2, RefreshCw, ChevronRight, Info, Calendar } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { format, addDays, differenceInDays, parseISO } from 'date-fns'
import type { ForecastRequest } from '../../api/forecastApi'
import { forecastApi } from '../../api/forecastApi'
import { useForecastStore } from '../../store/forecastStore'

interface ForecastConfigProps {
  onGenerate: (req: ForecastRequest) => void
  isLoading: boolean
}

const PRESETS = [
  { label: '7d',  days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
]

const MODEL_OPTIONS = [
  { id: 'prophet'  as const, label: 'Prophet',  color: '#6366f1', description: 'Facebook Prophet — great for daily seasonality and holiday effects.' },
  { id: 'arima'    as const, label: 'ARIMA',    color: '#f59e0b', description: 'Auto-ARIMA/SARIMA — classical statistical model, fast and interpretable.' },
  { id: 'ets'      as const, label: 'ETS',      color: '#10b981', description: 'Holt-Winters exponential smoothing — handles trend & weekly seasonality.' },
  { id: 'lstm'     as const, label: 'LSTM',     color: '#ef4444', description: 'Long Short-Term Memory neural network — captures complex non-linear patterns. Slowest.' },
  { id: 'ensemble' as const, label: 'Ensemble', color: '#8b5cf6', description: 'Weighted MA ensemble with DOW trend — fast, reliable, always available.' },
]

export default function ForecastConfig({ onGenerate, isLoading }: ForecastConfigProps) {
  const store = useForecastStore()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const [startDate, setStartDate] = useState(store.defaultStartDate)
  const [endDate, setEndDate] = useState(store.defaultEndDate)
  const [selectedModels, setSelectedModels] = useState<ForecastRequest['models']>(store.defaultModels)
  const [intervalMinutes, setIntervalMinutes] = useState<15 | 30>(store.defaultIntervalMinutes as 15 | 30)
  const [ciLevel, setCiLevel] = useState<'0.80' | '0.95'>(store.activeCI)
  const [tooltip, setTooltip] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const dayCount = useMemo(() => {
    try { return differenceInDays(parseISO(endDate), parseISO(startDate)) + 1 }
    catch { return 0 }
  }, [startDate, endDate])

  const dateError = useMemo(() => {
    if (!startDate || !endDate) return 'Both dates are required'
    if (dayCount < 7) return 'Minimum 7-day forecast range'
    if (dayCount > 180) return 'Maximum 180-day forecast range'
    return null
  }, [startDate, endDate, dayCount])

  const applyPreset = (days: number) => {
    const start = format(addDays(new Date(), 1), 'yyyy-MM-dd')
    // end = start + (days - 1) so the inclusive count equals exactly `days`
    const end = format(addDays(parseISO(start), days - 1), 'yyyy-MM-dd')
    setStartDate(start)
    setEndDate(end)
  }

  const toggleModel = (id: typeof MODEL_OPTIONS[0]['id']) => {
    setSelectedModels(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev
        return prev.filter(m => m !== id) as ForecastRequest['models']
      }
      return [...prev, id] as ForecastRequest['models']
    })
  }

  const handleGenerate = () => {
    if (dateError) { toast.error(dateError); return }
    if (selectedModels.length === 0) { toast.error('Select at least one model'); return }
    store.setDefaultDates(startDate, endDate)
    store.setDefaultModels(selectedModels)
    store.setActiveCI(ciLevel)
    const ciValues = ciLevel === '0.80' ? [0.80] : [0.80, 0.95]
    onGenerate({ startDate, endDate, models: selectedModels, confidence_intervals: ciValues, intervalMinutes })
  }

  const handleRefreshCache = async () => {
    setIsRefreshing(true)
    try {
      await forecastApi.refreshCache()
      toast.success('Data cache refreshed')
    } catch {
      toast.error('Failed to refresh cache')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-white/80" />
          <h2 className="text-base font-semibold text-white">Forecast Configuration</h2>
        </div>
        <p className="text-xs text-white/60 mt-0.5">Select date range, models and interval to generate</p>
      </div>

      <div className="p-5 space-y-5">

        {/* Date Range */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Forecast Date Range</label>
          </div>

          {/* Quick presets */}
          <div className="flex gap-1.5 mb-3">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.days)}
                className="px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                min={todayStr}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                min={startDate || todayStr}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {dateError ? (
            <p className="text-xs text-red-500 mt-1.5">{dateError}</p>
          ) : (
            <p className="text-xs text-emerald-600 mt-1.5 font-medium">✓ {dayCount} days selected ({format(parseISO(startDate), 'MMM d')} → {format(parseISO(endDate), 'MMM d, yyyy')})</p>
          )}
        </div>

        {/* Models */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Forecasting Models</label>
          <div className="space-y-1.5">
            {MODEL_OPTIONS.map(model => {
              const isSelected = selectedModels.includes(model.id)
              return (
                <div key={model.id}>
                  <button
                    onClick={() => toggleModel(model.id)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all',
                      isSelected ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                    )}
                  >
                    <div className={clsx('w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0', isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300')}>
                      {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: model.color }} />
                    <span className={clsx('text-sm font-medium flex-1', isSelected ? 'text-indigo-900' : 'text-gray-700')}>{model.label}</span>
                    <button onClick={e => { e.stopPropagation(); setTooltip(tooltip === model.id ? null : model.id) }} className="shrink-0 text-gray-400 hover:text-gray-600">
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </button>
                  {tooltip === model.id && (
                    <div className="mx-1 mt-1 p-2.5 bg-gray-800 text-white text-xs rounded-lg leading-relaxed">
                      {model.description}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} selected</p>
        </div>

        {/* Interval Granularity */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Interval Granularity</label>
          <div className="flex rounded-xl overflow-hidden border border-gray-200 p-0.5 bg-gray-100">
            {([15, 30] as const).map(m => (
              <button key={m} onClick={() => setIntervalMinutes(m)}
                className={clsx('flex-1 py-2 text-sm font-medium rounded-lg transition-all', intervalMinutes === m ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
              >
                {m}-min
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {intervalMinutes === 15 ? '15-min slots — highest resolution, ideal for intraday staffing' : '30-min slots — balanced accuracy for workforce planning'}
          </p>
        </div>

        {/* CI Toggle */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Confidence Interval</label>
          <div className="flex rounded-xl overflow-hidden border border-gray-200 p-0.5 bg-gray-100">
            {(['0.80', '0.95'] as const).map(ci => (
              <button key={ci} onClick={() => setCiLevel(ci)}
                className={clsx('flex-1 py-2 text-sm font-medium rounded-lg transition-all', ciLevel === ci ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
              >
                {ci === '0.80' ? '80%' : '95%'}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs">
          <p className="font-semibold text-gray-500">Run Summary</p>
          <div className="flex justify-between text-gray-600"><span>Date Range</span><span className="font-medium">{dayCount} days</span></div>
          <div className="flex justify-between text-gray-600"><span>Granularity</span><span className="font-medium">{intervalMinutes}-min slots</span></div>
          <div className="flex justify-between text-gray-600"><span>Models</span><span className="font-medium">{selectedModels.length} selected</span></div>
          <div className="flex justify-between text-gray-600"><span>CI Level</span><span className="font-medium">{ciLevel === '0.80' ? '80%' : '80% + 95%'}</span></div>
        </div>

        {/* Buttons */}
        <div className="space-y-2">
          <button
            onClick={handleGenerate}
            disabled={isLoading || !!dateError || selectedModels.length === 0}
            className={clsx(
              'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all',
              isLoading || !!dateError || selectedModels.length === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-sm hover:shadow-md'
            )}
          >
            {isLoading ? (
              <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Running Models...</>
            ) : (
              <><Zap className="w-4 h-4" />Generate Forecast<ChevronRight className="w-4 h-4" /></>
            )}
          </button>
          <button onClick={handleRefreshCache} disabled={isRefreshing || isLoading}
            className={clsx('w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all',
              isRefreshing || isLoading ? 'border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50' : 'border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400'
            )}
          >
            <RefreshCw className={clsx('w-4 h-4', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Data Cache'}
          </button>
        </div>
      </div>
    </div>
  )
}
