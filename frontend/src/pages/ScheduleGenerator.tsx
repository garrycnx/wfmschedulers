import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import Papa from 'papaparse'
import { Check, ChevronRight, Loader2, Send, Unlock, Lock } from 'lucide-react'
import { useScheduleStore } from '../store/scheduleStore'
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
  { id: 1, label: 'Upload Forecast' },
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
  const [currentStep, setCurrentStep] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [releaseFrom, setReleaseFrom] = useState(() => new Date().toISOString().split('T')[0])
  const [releaseTo, setReleaseTo] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 6); return d.toISOString().split('T')[0]
  })

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

      {/* Step 1 – Upload */}
      {currentStep === 1 && (
        <ForecastUpload onParsed={handleForecastParsed} settings={store.settings} />
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
                  onClick={() => {
                    if (!releaseFrom || !releaseTo) { toast.error('Select a date range first.'); return }
                    if (releaseTo < releaseFrom) { toast.error('End date must be after start date.'); return }
                    store.releaseSchedule({ from: releaseFrom, to: releaseTo })
                    toast.success('✅ Schedule released! Agents can now view their shifts.')
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
    </div>
  )
}
