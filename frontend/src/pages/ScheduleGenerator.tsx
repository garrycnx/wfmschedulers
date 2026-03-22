import { useRef, useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import Papa from 'papaparse'
import { Check, ChevronRight, Loader2, Send, Unlock, Lock, AlertTriangle } from 'lucide-react'
import { useScheduleStore } from '../store/scheduleStore'
import { useLobStore } from '../store/lobStore'
import { schedulesApi, apiClient } from '../api/client'
import SettingsPanel from '../components/scheduling/SettingsPanel'
import ForecastUpload from '../components/scheduling/ForecastUpload'
import StaffingChart from '../components/scheduling/StaffingChart'
import ScheduleTable from '../components/scheduling/ScheduleTable'
import ProjectionsTable from '../components/scheduling/ProjectionsTable'
import ImpactAnalysis from '../components/scheduling/ImpactAnalysis'
import {
  computeRequiredStaff,
  generateRoster,
  buildScheduledCounts,
  buildRosterRows,
  assignBreaks,
  computeProjections,
  minToTime,
  timeToMin,
} from '../utils/scheduleEngine'
import type { ForecastRow, Weekday } from '../types'
import { WEEKDAYS } from '../types'

const STEPS = [
  { id: 1, label: 'Forecast' },
  { id: 2, label: 'Configure Settings' },
  { id: 3, label: 'Review Required Staff' },
  { id: 4, label: 'Generated Roster' },
  { id: 5, label: 'Projections & Export' },
]

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ScheduleGenerator() {
  const store = useScheduleStore()
  const { lobs, fetchLobs } = useLobStore()
  const [searchParams] = useSearchParams()

  // Detect if we arrived from the Forecasting module with pre-loaded data
  const fromForecast = searchParams.get('fromForecast') === '1'
  const forecastSource = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('forecast_source') ?? 'null') } catch { return null }
  }, [])

  const [currentStep, setCurrentStep] = useState(() =>
    fromForecast && store.forecastRows.length > 0 ? 2 : 1
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedLobId, setSelectedLobId] = useState<string>('')
  const [scheduleFrom, setScheduleFrom] = useState(() => new Date().toISOString().split('T')[0])
  const [scheduleTo, setScheduleTo] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 6); return d.toISOString().split('T')[0]
  })
  const [releaseFrom, setReleaseFrom] = useState(() => new Date().toISOString().split('T')[0])
  const [releaseTo, setReleaseTo] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 6); return d.toISOString().split('T')[0]
  })

  const [existingForLob, setExistingForLob] = useState<{id:string; name:string; from:string; to:string}[]>([])
  const [overwriteConfirm, setOverwriteConfirm] = useState(false)

  useEffect(() => { fetchLobs() }, [])

  // Check for existing schedules whenever LOB or date range changes
  useEffect(() => {
    if (!selectedLobId) { setExistingForLob([]); return }
    apiClient.get<Array<{id:string; name:string; fromDate:string|null; toDate:string|null; weekStartDate:string}>>(
      `/schedules?lobId=${selectedLobId}&from=${scheduleFrom}&to=${scheduleTo}`
    ).then(r => {
      setExistingForLob(r.data.map(s => ({
        id: s.id,
        name: s.name,
        from: (s.fromDate ?? s.weekStartDate).split('T')[0],
        to:   (s.toDate  ?? s.weekStartDate).split('T')[0],
      })))
    }).catch(() => {})
  }, [selectedLobId, scheduleFrom, scheduleTo])

  // ── Step 1: Parse uploaded CSV ────────────────────────────────────────────
  function handleForecastParsed(rows: ForecastRow[]) {
    store.setForecast(rows)
    toast.success(`Loaded ${rows.length} intervals across ${new Set(rows.map((r) => r.weekday)).size} days`)
    setCurrentStep(2)
  }

  // ── Step 2→3: Compute required staff ─────────────────────────────────────
  function handleComputeRequired() {
    if (!store.forecastRows.length) {
      toast.error('Please upload a forecast first.')
      return
    }
    const allSlots = [...new Set(store.forecastRows.map((r) => r.slotMin))].sort((a, b) => a - b)
    const required = computeRequiredStaff(store.forecastRows, store.settings, allSlots)
    store.setRequiredStaff(required)
    setCurrentStep(3)
    toast.success('Required staffing computed.')
  }

  // ── Step 3→4: Generate full roster ───────────────────────────────────────
  async function handleGenerateRoster() {
    if (!store.requiredStaff.length) { toast.error('Compute required staff first.'); return }
    if (existingForLob.length > 0) { setOverwriteConfirm(true); return }
    await runGenerate()
  }

  async function runGenerate() {
    setOverwriteConfirm(false)
    setIsGenerating(true)
    store.setStep('generating_roster')

    try {
      await new Promise((r) => setTimeout(r, 80)) // allow UI repaint

      const allSlots = [...new Set(store.forecastRows.map((r) => r.slotMin))].sort((a, b) => a - b)

      // Generate agents (pass forecast for day-level SLA pruning)
      const agents = generateRoster(store.requiredStaff, store.settings, allSlots, store.forecastRows)
      store.setAgents(agents)
      store.setRosterRows(buildRosterRows(agents))

      // Scheduled counts
      const schedCounts = buildScheduledCounts(agents, allSlots)

      // Breaks
      const breaks = assignBreaks(agents, allSlots, store.settings, schedCounts, store.requiredStaff)
      store.setBreakRows(breaks)

      // Projections
      const projs = computeProjections(
        store.forecastRows, schedCounts, store.requiredStaff, store.settings, allSlots,
      )
      store.setProjections(projs)

      store.setStep('done')
      setCurrentStep(4)
      toast.success(`Roster generated: ${agents.length} agents scheduled.`)
    } catch (e: unknown) {
      store.setStep('error')
      toast.error('Generation failed. Check your data and settings.')
      console.error(e)
    } finally {
      setIsGenerating(false)
    }
  }

  // ── All slots from forecast ───────────────────────────────────────────────
  const allSlots = [...new Set(store.forecastRows.map((r) => r.slotMin))].sort((a, b) => a - b)

  // ── Build pivot tables for charts ────────────────────────────────────────
  const requiredPivot: Record<string, Record<string, number>> = {}
  const actualPivot: Record<string, Record<string, number>> = {}

  if (store.requiredStaff.length) {
    const schedCounts = store.agents.length
      ? buildScheduledCounts(store.agents, allSlots)
      : null

    for (const wd of WEEKDAYS) {
      requiredPivot[wd] = {}
      actualPivot[wd] = {}
      for (const t of allSlots) {
        const lbl = minToTime(t)
        const r = store.requiredStaff.find((s) => s.weekday === wd && s.slotMin === t)
        requiredPivot[wd][lbl] = r?.required ?? 0
        actualPivot[wd][lbl] = schedCounts?.[wd]?.[lbl] ?? 0
      }
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Step indicator */}
      <div className="card p-4">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => currentStep > step.id && setCurrentStep(step.id)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold border transition-all ${
                  step.id === currentStep ? 'step-active' :
                  step.id < currentStep   ? 'step-complete cursor-pointer hover:brightness-110' :
                  'step-pending cursor-default'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                  ${step.id === currentStep ? 'bg-white/20' :
                    step.id < currentStep   ? 'bg-emerald-100' : 'bg-gray-200'}`}>
                  {step.id < currentStep ? <Check className="w-3 h-3" /> : step.id}
                </span>
                {step.label}
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className={`w-4 h-4 shrink-0 ${currentStep > step.id ? 'text-emerald-600' : 'text-gray-300'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* LOB + Date range selector (always visible at top) */}
      <div className="card p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Schedule Configuration
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* LOB */}
          <div>
            <label className="label">Line of Business</label>
            <select
              className="input"
              value={selectedLobId}
              onChange={(e) => setSelectedLobId(e.target.value)}
            >
              <option value="">— All / No LOB —</option>
              {lobs.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {selectedLobId && (
              <p className="text-[10px] text-brand-600 mt-1 font-medium">
                {lobs.find(l => l.id === selectedLobId)?._count?.agents ?? '?'} agents in this LOB
              </p>
            )}
            {existingForLob.length > 0 && (
              <div className="mt-2 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[10px] text-amber-700 leading-relaxed">
                  <span className="font-semibold block">Schedule already exists for this period:</span>
                  {existingForLob.map(s => (
                    <span key={s.id} className="block">{s.name}: {fmtDate(s.from)} → {fmtDate(s.to)}</span>
                  ))}
                  <span className="block mt-0.5">Generating will overwrite it.</span>
                </div>
              </div>
            )}
          </div>
          {/* From date */}
          <div>
            <label className="label">Schedule From</label>
            <input
              type="date"
              className="input"
              value={scheduleFrom}
              onChange={(e) => { setScheduleFrom(e.target.value); setReleaseFrom(e.target.value) }}
            />
          </div>
          {/* To date */}
          <div>
            <label className="label">Schedule To</label>
            <input
              type="date"
              className="input"
              value={scheduleTo}
              min={scheduleFrom}
              onChange={(e) => { setScheduleTo(e.target.value); setReleaseTo(e.target.value) }}
            />
          </div>
        </div>
      </div>

      {/* Step 1 – Upload or AI Forecast banner */}
      {currentStep === 1 && (
        fromForecast && store.forecastRows.length > 0 ? (
          <div className="max-w-2xl mx-auto space-y-4">
            {/* AI Forecast loaded banner */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold">AI Forecast Loaded</h3>
                  <p className="text-xs text-white/80 mt-1">
                    {forecastSource
                      ? `${forecastSource.intervals} intervals · ${forecastSource.intervalMinutes}-min · ${forecastSource.model} · ${forecastSource.from} → ${forecastSource.to}`
                      : `${store.forecastRows.length} interval rows loaded from Forecasting module`
                    }
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setCurrentStep(2)}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-600
                           hover:bg-brand-500 text-white font-semibold text-sm transition-all shadow-glow-sm"
              >
                Continue to Configuration <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => { store.setForecast([]); localStorage.removeItem('forecast_source') }}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200
                           text-gray-600 font-medium text-sm hover:bg-gray-50 transition-all"
              >
                Replace with CSV Upload
              </button>
            </div>
            {/* Show upload below as fallback */}
            {store.forecastRows.length === 0 && (
              <ForecastUpload onParsed={handleForecastParsed} settings={store.settings} />
            )}
          </div>
        ) : (
          <ForecastUpload onParsed={handleForecastParsed} settings={store.settings} />
        )
      )}

      {/* Step 2 – Settings */}
      {currentStep === 2 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1">
            <SettingsPanel
              settings={store.settings}
              onChange={(p) => store.updateSettings(p)}
            />
          </div>
          <div className="xl:col-span-2 space-y-4">
            {/* Forecast preview */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Forecast Preview
                <span className="ml-2 text-xs font-normal text-gray-500">({allSlots.length} intervals)</span>
              </h3>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="wfm-table w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="text-left">Time</th>
                      {WEEKDAYS.map((d) => <th key={d} className="text-center">{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {/* TOTAL row at top */}
                    <tr className="bg-brand-50 font-bold border-b-2 border-brand-200">
                      <td className="font-bold text-brand-700">TOTAL</td>
                      {WEEKDAYS.map((wd) => {
                        const total = allSlots.reduce((sum, t) => {
                          return sum + (store.forecastRows.find((r) => r.weekday === wd && r.slotMin === t)?.volume ?? 0)
                        }, 0)
                        return <td key={wd} className="text-center text-brand-700 font-bold">{Math.round(total)}</td>
                      })}
                    </tr>
                    {allSlots.map((t) => (
                      <tr key={t}>
                        <td className="font-mono font-medium text-gray-700">{minToTime(t)}</td>
                        {WEEKDAYS.map((wd) => {
                          const v = store.forecastRows.find((r) => r.weekday === wd && r.slotMin === t)?.volume ?? 0
                          return <td key={wd} className="text-center text-gray-700">{v.toFixed(0)}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              onClick={handleComputeRequired}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold
                         rounded-xl py-3 text-sm transition-all shadow-glow-sm"
            >
              Compute Required Staffing →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 – Required + charts */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <StaffingChart
            allSlots={allSlots}
            requiredPivot={requiredPivot}
            actualPivot={actualPivot}
            showActual={false}
          />

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Required Staffing
              <span className="ml-2 text-xs font-normal text-gray-500">({allSlots.length} intervals)</span>
            </h3>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="wfm-table w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="text-left">Time</th>
                    {WEEKDAYS.map((d) => <th key={d} className="text-center">{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {/* TOTAL row */}
                  <tr className="bg-brand-50 font-bold border-b-2 border-brand-200">
                    <td className="font-bold text-brand-700">TOTAL</td>
                    {WEEKDAYS.map((wd) => {
                      const total = allSlots.reduce((sum, t) => {
                        return sum + (store.requiredStaff.find((s) => s.weekday === wd && s.slotMin === t)?.required ?? 0)
                      }, 0)
                      return <td key={wd} className="text-center text-brand-700 font-bold">{Math.round(total)}</td>
                    })}
                  </tr>
                  {allSlots.map((t) => (
                    <tr key={t}>
                      <td className="font-mono font-medium text-gray-700">{minToTime(t)}</td>
                      {WEEKDAYS.map((wd) => {
                        const r = store.requiredStaff.find((s) => s.weekday === wd && s.slotMin === t)
                        const v = r?.required ?? 0
                        return (
                          <td key={wd} className="text-center">
                            <span className={v > 0 ? 'text-brand-600 font-semibold' : 'text-gray-400'}>{v}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            onClick={handleGenerateRoster}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500
                       disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold
                       rounded-xl py-3.5 text-sm transition-all shadow-glow-sm"
          >
            {isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
            {isGenerating ? 'Generating Roster…' : '🚀 Generate Full Roster →'}
          </button>
        </div>
      )}

      {/* Step 4 – Roster + breaks */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <StaffingChart
            allSlots={allSlots}
            requiredPivot={requiredPivot}
            actualPivot={actualPivot}
            showActual={true}
          />

          <ScheduleTable
            rosterRows={store.rosterRows}
            breakRows={store.breakRows}
            onModify={() => toast.success('Use the Impact Analysis tab to preview changes.')}
          />

          <ImpactAnalysis
            agents={store.agents}
            forecastRows={store.forecastRows}
            requiredStaff={store.requiredStaff}
            settings={store.settings}
            allSlots={allSlots}
          />

          {/* Release to Agents */}
          <div className={`p-5 rounded-2xl border transition-all ${
            store.released ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
          }`}>
            {/* Header row */}
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                store.released ? 'bg-emerald-100' : 'bg-gray-100'
              }`}>
                {store.released
                  ? <Unlock className="w-5 h-5 text-emerald-600" />
                  : <Lock className="w-5 h-5 text-gray-500" />
                }
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${store.released ? 'text-emerald-700' : 'text-gray-700'}`}>
                  {store.released ? 'Schedule Released to Agents' : 'Release Schedule to Agents'}
                </p>
                <p className={`text-xs mt-0.5 ${store.released ? 'text-emerald-600' : 'text-gray-500'}`}>
                  {store.released
                    ? `Released for ${fmtDate(store.releaseRange!.from)} – ${fmtDate(store.releaseRange!.to)}. Agents can view their shifts in the portal.`
                    : 'Pick a date range then release so agents can view their day-by-day schedule in the portal.'
                  }
                </p>
              </div>
              {store.released && (
                <button
                  onClick={() => { store.unrelease(); toast.success('Schedule hidden from agents.') }}
                  className="shrink-0 text-xs text-emerald-700 hover:text-red-600 border border-emerald-300
                             hover:border-red-300 rounded-xl px-3 py-1.5 font-semibold transition-all bg-white"
                >
                  Unrelease
                </button>
              )}
            </div>

            {/* Date pickers – only visible before release */}
            {!store.released && (
              <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-gray-200">
                <div className="flex-1 min-w-[160px]">
                  <label className="label">From Date</label>
                  <input
                    type="date"
                    className="input"
                    value={releaseFrom}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setReleaseFrom(e.target.value)}
                  />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="label">To Date</label>
                  <input
                    type="date"
                    className="input"
                    value={releaseTo}
                    min={releaseFrom || new Date().toISOString().split('T')[0]}
                    onChange={(e) => setReleaseTo(e.target.value)}
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!releaseFrom || !releaseTo) { toast.error('Select a date range first.'); return }
                    if (releaseTo < releaseFrom) { toast.error('End date must be after start date.'); return }
                    store.releaseSchedule({ from: releaseFrom, to: releaseTo })
                    toast.success('✅ Schedule released! Agents can now view their shifts.')
                    // Persist to backend (silent fallback – localStorage already saved it)
                    try {
                      const lobName = lobs.find(l => l.id === selectedLobId)?.name
                      const saved = await schedulesApi.save({
                        name: `${lobName ? lobName + ' · ' : ''}${scheduleFrom} → ${scheduleTo}`,
                        weekStartDate: scheduleFrom,
                        fromDate: scheduleFrom,
                        toDate: scheduleTo,
                        lobId: selectedLobId || undefined,
                        settingsJson: JSON.stringify({ ...store.settings, releaseFrom, releaseTo }),
                        forecastJson: JSON.stringify(store.forecastRows),
                        requiredJson: JSON.stringify(store.requiredStaff),
                        agentsJson: JSON.stringify(store.agents.map(a => ({
                          ...a,
                          agentId: store.agentAssignments[a.id] ?? a.agentId,
                        }))),
                        projectionsJson: JSON.stringify(store.projections),
                        rosterJson: JSON.stringify(store.rosterRows),
                        breaksJson: JSON.stringify(store.breakRows),
                      })
                      await schedulesApi.publish(saved.data.id)
                    } catch {
                      // Backend not yet connected – data is still safe in localStorage
                    }
                  }}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white
                             font-semibold rounded-xl px-4 py-2 text-sm transition-all shadow-sm whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  Release to Agents
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setCurrentStep(5)}
            className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold
                       rounded-xl py-3 text-sm transition-all shadow-glow-sm"
          >
            View Projections & Export →
          </button>
        </div>
      )}

      {/* Step 5 – Projections + export */}
      {currentStep === 5 && (
        <ProjectionsTable
          projections={store.projections}
          rosterRows={store.rosterRows}
          breakRows={store.breakRows}
          forecastRows={store.forecastRows}
          requiredStaff={store.requiredStaff}
        />
      )}

      {/* ── Overwrite Confirm Modal ─────────────────────────────────────────── */}
      {overwriteConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setOverwriteConfirm(false)} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                          bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-96">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-600" />
              </div>
              <h3 className="font-bold text-gray-900">Overwrite existing schedule?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              A schedule already exists for <span className="font-semibold text-gray-700">
              {lobs.find(l => l.id === selectedLobId)?.name}</span> during this period:
            </p>
            <ul className="mb-5 space-y-1">
              {existingForLob.map(s => (
                <li key={s.id} className="text-xs text-amber-700 bg-amber-50 border border-amber-100
                                          rounded-lg px-3 py-1.5 font-medium">
                  {s.name}: {fmtDate(s.from)} → {fmtDate(s.to)}
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button
                onClick={() => setOverwriteConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500
                           border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={runGenerate}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white
                           bg-amber-600 hover:bg-amber-500 transition-all"
              >
                Yes, overwrite
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
