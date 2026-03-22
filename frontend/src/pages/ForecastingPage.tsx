import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart2, Download, AlertCircle, RefreshCw, ArrowRight,
  FileText, FileJson, Table2, Layers, LineChart, PieChart,
  Lightbulb, CheckCircle2, Loader2, Clock
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

import { forecastApi } from '../api/forecastApi'
import type { ForecastRequest } from '../api/forecastApi'
import { useForecastStore } from '../store/forecastStore'
import ForecastConfig from '../components/forecasting/ForecastConfig'
import ForecastChart from '../components/forecasting/ForecastChart'
import ModelComparisonTable from '../components/forecasting/ModelComparisonTable'
import AccuracyChart from '../components/forecasting/AccuracyChart'
import DistributionTable from '../components/forecasting/DistributionTable'
import InsightsPanel from '../components/forecasting/InsightsPanel'
import IntervalHeatmap from '../components/forecasting/IntervalHeatmap'
import DailyIntervalChart from '../components/forecasting/DailyIntervalChart'

type Tab = 'overview' | 'comparison' | 'distribution' | 'interval' | 'insights'

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'overview',    label: 'Overview',          icon: <LineChart className="w-4 h-4" /> },
  { id: 'comparison',  label: 'Model Comparison',  icon: <Layers className="w-4 h-4" /> },
  { id: 'interval',    label: 'Interval Breakdown', icon: <Clock className="w-4 h-4" /> },
  { id: 'distribution',label: 'Distribution',       icon: <PieChart className="w-4 h-4" /> },
  { id: 'insights',    label: 'Insights',           icon: <Lightbulb className="w-4 h-4" /> },
]

const LOADING_STEPS = [
  { label: 'Fetching historical call data',      delay: 0 },
  { label: 'Running forecasting models',         delay: 1500 },
  { label: 'Computing confidence intervals',     delay: 3500 },
  { label: 'Distributing to 30-min intervals',   delay: 5500 },
  { label: 'Calculating metrics & insights',     delay: 7500 },
]

function LoadingOverlay({ isLoading }: { isLoading: boolean }) {
  const [step, setStep] = useState(0)

  useState(() => {
    if (!isLoading) { setStep(0); return }
    const timers = LOADING_STEPS.map((s, i) => setTimeout(() => setStep(i), s.delay))
    return () => timers.forEach(clearTimeout)
  })

  if (!isLoading) return null

  return (
    <div className="absolute inset-0 bg-white/92 backdrop-blur-sm z-20 flex flex-col items-center justify-center rounded-2xl">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center mx-auto mb-6 shadow-lg">
          <svg className="animate-spin w-8 h-8 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-800 mb-4">Running AI Forecast Models</h3>
        <div className="space-y-2.5 text-left min-w-[300px]">
          {LOADING_STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              {i < step ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : i === step ? (
                <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-gray-200 shrink-0" />
              )}
              <span className={clsx('text-sm', i <= step ? 'text-gray-800 font-medium' : 'text-gray-400')}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-5">LSTM model may take up to 5 minutes</p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-6">
        <BarChart2 className="w-10 h-10 text-indigo-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-800 mb-2">No Forecast Generated Yet</h3>
      <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
        Select your <span className="font-semibold text-indigo-600">date range</span> and models on the left panel, then click{' '}
        <span className="font-semibold text-indigo-600">Generate Forecast</span> to run AI-powered call volume predictions.
      </p>
      <div className="mt-6 grid grid-cols-3 gap-2 text-xs text-gray-400">
        {['Prophet', 'ARIMA', 'ETS', 'LSTM', 'Ensemble'].map(m => (
          <div key={m} className="bg-gray-50 rounded-xl px-3 py-2 font-medium">{m}</div>
        ))}
      </div>
    </div>
  )
}

export default function ForecastingPage() {
  const navigate = useNavigate()
  const store = useForecastStore()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const result = store.result
  const isLoading = store.isLoading
  const error = store.error

  // All unique dates in interval data
  const allIntervalDates = result
    ? [...new Set(result.interval_data?.map(d => d.date) ?? [])].sort()
    : []

  const selectedDay = store.selectedDay ?? allIntervalDates[0] ?? null

  const handleGenerate = async (req: ForecastRequest) => {
    store.setLoading(true)
    store.setError(null)
    try {
      const res = await forecastApi.generate(req)
      store.setResult(res)
      setActiveTab('overview')
      const bestName = res.model_results[res.best_model]?.model_display_name ?? res.best_model
      toast.success(`Forecast complete! Best model: ${bestName}`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      const msg = err.response?.data?.detail || err.message || 'Forecast generation failed'
      store.setError(msg)
      toast.error('Forecast generation failed')
    } finally {
      store.setLoading(false)
    }
  }

  const handleUseInScheduler = () => {
    if (!result) return
    localStorage.setItem('forecast_result', JSON.stringify(result))
    // Also create a WFM-compatible forecast CSV format for the schedule generator
    if (result.interval_data?.length) {
      const csvRows = result.interval_data.map(d => ({
        date: d.date,
        day_of_week: d.dayOfWeek,
        time: d.time,
        calls: Math.round(d.calls),
      }))
      localStorage.setItem('forecast_interval_csv', JSON.stringify(csvRows))
    }
    toast.success('Forecast saved — opening Schedule Generator')
    navigate('/generate')
  }

  const handleExport = (fmt: 'csv' | 'json' | 'excel') => {
    if (!result) return
    window.open(forecastApi.getExportUrl(result.job_id, fmt), '_blank')
  }

  const formattedGenAt = result?.generated_at
    ? (() => { try { return format(parseISO(result.generated_at), 'MMM d, yyyy h:mm a') } catch { return result.generated_at } })()
    : null

  const totalForecastCalls = result
    ? Math.round(result.interval_data?.reduce((s, d) => s + d.calls, 0) ?? 0)
    : 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-screen-2xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-sm">
                <BarChart2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Demand Forecasting</h1>
                <p className="text-sm text-gray-500">AI-powered call volume predictions with 30-min interval breakdown</p>
              </div>
            </div>

            {result && (
              <div className="flex items-center gap-5 text-sm">
                <div className="text-center">
                  <p className="text-xs text-gray-400">Forecast Period</p>
                  <p className="font-semibold text-gray-700">{format(parseISO(result.startDate), 'MMM d')} – {format(parseISO(result.endDate), 'MMM d, yyyy')}</p>
                </div>
                <div className="h-8 w-px bg-gray-200" />
                <div className="text-center">
                  <p className="text-xs text-gray-400">Total Forecast</p>
                  <p className="font-semibold text-indigo-700">{totalForecastCalls.toLocaleString()} calls</p>
                </div>
                <div className="h-8 w-px bg-gray-200" />
                <div className="text-center">
                  <p className="text-xs text-gray-400">Generated</p>
                  <p className="font-semibold text-gray-700">{formattedGenAt}</p>
                </div>
              </div>
            )}

            {result && (
              <div className="flex items-center gap-2">
                <button onClick={() => handleExport('csv')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  <Table2 className="w-3.5 h-3.5" />CSV
                </button>
                <button onClick={() => handleExport('json')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  <FileJson className="w-3.5 h-3.5" />JSON
                </button>
                <button onClick={() => handleExport('excel')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  <FileText className="w-3.5 h-3.5" />Excel
                </button>
                <button onClick={handleUseInScheduler} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm">
                  <Download className="w-3.5 h-3.5" />Use in Scheduler<ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex flex-col xl:flex-row gap-6">
          {/* Left: Config */}
          <div className="w-full xl:w-80 shrink-0">
            <div className="xl:sticky xl:top-6">
              <ForecastConfig onGenerate={handleGenerate} isLoading={isLoading} />
            </div>
          </div>

          {/* Right: Results */}
          <div className="flex-1 min-w-0">
            {error && !isLoading && (
              <div className="mb-4 flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800">Forecast generation failed</p>
                  <p className="text-xs text-red-600 mt-0.5">{error}</p>
                </div>
                <button onClick={() => store.setError(null)} className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800 flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5" />Dismiss
                </button>
              </div>
            )}

            {!result && !isLoading && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm"><EmptyState /></div>
            )}

            {isLoading && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden" style={{ minHeight: 480 }}>
                <LoadingOverlay isLoading={isLoading} />
              </div>
            )}

            {result && !isLoading && (
              <div className="space-y-5">
                {/* Tabs */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex border-b border-gray-100 px-2 pt-2 overflow-x-auto">
                    {TABS.map(tab => (
                      <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={clsx(
                          'flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-xl transition-all whitespace-nowrap shrink-0',
                          activeTab === tab.id
                            ? 'text-indigo-700 bg-indigo-50 border-b-2 border-indigo-600 -mb-px'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        )}
                      >
                        {tab.icon}{tab.label}
                        {tab.id === 'insights' && result.insights.length > 0 && (
                          <span className="ml-1 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center">
                            {result.insights.length}
                          </span>
                        )}
                        {tab.id === 'interval' && result.interval_data?.length > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                            {result.interval_time_slots?.length ?? 0} slots
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="p-5">

                      {/* Overview */}
                      {activeTab === 'overview' && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-500 font-medium">Active Model:</span>
                            {Object.entries(result.model_results).map(([key, mr]) => {
                              const isSel = store.selectedModel === key
                              const isBest = key === result.best_model
                              return (
                                <button key={key} onClick={() => store.setSelectedModel(key)}
                                  className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                                    isSel ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                                  )}
                                >
                                  {mr.model_display_name}
                                  {isBest && <span className={clsx('text-[9px] font-bold px-1 rounded', isSel ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700')}>BEST</span>}
                                </button>
                              )
                            })}
                            <div className="ml-auto flex rounded-lg overflow-hidden border border-gray-200 text-xs">
                              {(['0.80', '0.95'] as const).map(ci => (
                                <button key={ci} onClick={() => store.setActiveCI(ci)}
                                  className={clsx('px-3 py-1.5 font-medium transition-colors', store.activeCI === ci ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50')}
                                >{ci === '0.80' ? '80% CI' : '95% CI'}</button>
                              ))}
                            </div>
                          </div>
                          <ForecastChart historical={result.historical_data} modelResults={result.model_results} selectedModel={store.selectedModel} activeCI={store.activeCI} />
                        </div>
                      )}

                      {/* Model Comparison */}
                      {activeTab === 'comparison' && (
                        <div className="space-y-5">
                          <ModelComparisonTable modelResults={result.model_results} selectedModel={store.selectedModel} onSelect={store.setSelectedModel} bestModel={result.best_model} />
                          <AccuracyChart modelResults={result.model_results} />
                        </div>
                      )}

                      {/* Interval Breakdown */}
                      {activeTab === 'interval' && (
                        <div className="space-y-6">
                          {(!result.interval_data || result.interval_data.length === 0) ? (
                            <div className="text-center py-16 text-gray-500">
                              <Clock className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                              <p className="font-medium">No interval data available</p>
                              <p className="text-xs mt-1">Re-run the forecast with 30-min or 60-min interval granularity</p>
                            </div>
                          ) : (
                            <>
                              {/* Heatmap */}
                              <div className="bg-gray-50 rounded-xl p-4">
                                <IntervalHeatmap
                                  intervalData={result.interval_data}
                                  timeSlots={result.interval_time_slots ?? []}
                                  onSelectDay={store.setSelectedDay}
                                  selectedDay={selectedDay}
                                />
                              </div>

                              {/* Daily interval chart */}
                              {selectedDay && (
                                <div className="border border-gray-200 rounded-xl p-4">
                                  <DailyIntervalChart
                                    intervalData={result.interval_data}
                                    selectedDay={selectedDay}
                                    allDates={allIntervalDates}
                                    onPrevDay={() => {
                                      const idx = allIntervalDates.indexOf(selectedDay)
                                      if (idx > 0) store.setSelectedDay(allIntervalDates[idx - 1])
                                    }}
                                    onNextDay={() => {
                                      const idx = allIntervalDates.indexOf(selectedDay)
                                      if (idx < allIntervalDates.length - 1) store.setSelectedDay(allIntervalDates[idx + 1])
                                    }}
                                    intervalMinutes={result.intervalMinutes ?? 30}
                                  />
                                </div>
                              )}

                              {/* DOW average pattern */}
                              {result.dow_pattern && Object.keys(result.dow_pattern).length > 0 && (
                                <div className="border border-gray-200 rounded-xl p-4">
                                  <h3 className="text-sm font-semibold text-gray-800 mb-1">Day-of-Week Average Pattern</h3>
                                  <p className="text-xs text-gray-500 mb-3">Average daily call volume by weekday (from forecast period)</p>
                                  <div className="flex items-end gap-2 h-24">
                                    {Object.entries(result.dow_pattern).map(([dow, slots]) => {
                                      const total = (slots as number[]).reduce((a, b) => a + b, 0)
                                      const maxTotal = Math.max(...Object.values(result.dow_pattern).map((s: unknown) => (s as number[]).reduce((a: number, b: number) => a + b, 0)))
                                      const pct = maxTotal > 0 ? total / maxTotal : 0
                                      return (
                                        <div key={dow} className="flex-1 flex flex-col items-center gap-1">
                                          <div className="w-full bg-indigo-500 rounded-t-md transition-all" style={{ height: `${Math.max(8, pct * 80)}px` }} />
                                          <span className="text-[10px] text-gray-500 capitalize">{dow.slice(0,3)}</span>
                                          <span className="text-[10px] font-medium text-indigo-700">{Math.round(total).toLocaleString()}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Distribution */}
                      {activeTab === 'distribution' && (
                        <DistributionTable distribution={result.distribution} horizon={result.horizon} jobId={result.job_id} />
                      )}

                      {/* Insights */}
                      {activeTab === 'insights' && (
                        <InsightsPanel insights={result.insights} seasonality={result.seasonality} result={result} />
                      )}

                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* CTA */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Ready to build your schedule?</h3>
                    <p className="text-xs text-white/70 mt-0.5">
                      Send this {result.intervalMinutes ?? 30}-min interval forecast to the Schedule Generator to auto-size staffing.
                    </p>
                  </div>
                  <button onClick={handleUseInScheduler} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-indigo-700 text-sm font-semibold hover:bg-indigo-50 transition-colors shadow-sm shrink-0">
                    Use This Forecast in Scheduler<ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
