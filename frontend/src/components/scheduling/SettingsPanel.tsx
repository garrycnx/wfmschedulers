import { Info } from 'lucide-react'
import { useState, useEffect } from 'react'
import type { ScheduleSettings } from '../../types'

interface Props {
  settings: ScheduleSettings
  onChange: (partial: Partial<ScheduleSettings>) => void
}

function NumberStepper({
  label, value, min, max, step = 1, onChange, help
}: {
  label: string; value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; help?: string
}) {
  const [raw, setRaw] = useState(String(value))

  // Keep raw in sync when value changes externally
  useEffect(() => { setRaw(String(value)) }, [value])

  function commit(raw: string) {
    const n = parseFloat(raw)
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)))
    else setRaw(String(value)) // revert bad input
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="label mb-0">{label}</label>
        {help && (
          <div className="relative group">
            <Info className="w-3 h-3 text-gray-400 hover:text-gray-600 cursor-help" />
            <div className="absolute left-4 top-0 z-50 hidden group-hover:block w-52 bg-white border border-gray-200 rounded-xl p-2.5 text-xs text-gray-700 shadow-lg">
              {help}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-400 transition-all">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="px-3 py-2.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all font-bold text-sm select-none"
          tabIndex={-1}
        >−</button>
        <input
          type="number"
          className="flex-1 text-center text-sm font-semibold text-gray-900 py-2 bg-transparent border-none outline-none
                     [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          value={raw}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value) }}
        />
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          className="px-3 py-2.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all font-bold text-sm select-none"
          tabIndex={-1}
        >+</button>
      </div>
    </div>
  )
}

function RadioGroup<T extends string>({
  label, value, options, onChange, help
}: {
  label: string; value: T; options: { value: T; label: string }[]
  onChange: (v: T) => void; help?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <label className="label mb-0">{label}</label>
        {help && (
          <div className="relative group">
            <Info className="w-3 h-3 text-gray-400 hover:text-gray-600 cursor-help" />
            <div className="absolute left-4 top-0 z-50 hidden group-hover:block w-52 bg-white border border-gray-200 rounded-xl p-2.5 text-xs text-gray-700 shadow-lg">
              {help}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2.5 cursor-pointer group">
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
              value === o.value
                ? 'border-brand-500 bg-brand-500'
                : 'border-gray-300 group-hover:border-gray-400'
            }`}>
              {value === o.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
            <input type="radio" className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className="text-sm text-gray-700">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

export default function SettingsPanel({ settings, onChange }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-5">
      <h3 className="text-sm font-bold text-gray-900">Schedule Settings</h3>

      <RadioGroup
        label="Forecast Interval"
        value={settings.intervalFormat}
        options={[
          { value: '15 minutes', label: '15 minutes' },
          { value: '30 minutes', label: '30 minutes' },
        ]}
        onChange={(v) => onChange({ intervalFormat: v })}
      />

      <NumberStepper
        label="AHT (seconds)"
        value={settings.ahtSeconds}
        min={1} max={3000}
        onChange={(v) => onChange({ ahtSeconds: v })}
        help="Average Handle Time – average call duration in seconds"
      />

      <NumberStepper
        label="SLA Target (%)"
        value={settings.slaTargetPct}
        min={1} max={100}
        onChange={(v) => onChange({ slaTargetPct: v })}
      />

      <NumberStepper
        label="SLA Threshold (seconds)"
        value={settings.slaThresholdSeconds}
        min={1} max={300}
        onChange={(v) => onChange({ slaThresholdSeconds: v })}
        help="Target answer speed (e.g. 80% within 20s)"
      />

      <NumberStepper
        label="Abandon Target (%)"
        value={settings.abandonTargetPct}
        min={0} max={50}
        onChange={(v) => onChange({ abandonTargetPct: v })}
      />

      <NumberStepper
        label="Avg Patience (seconds)"
        value={settings.patienceSeconds}
        min={1} max={600}
        onChange={(v) => onChange({ patienceSeconds: v })}
        help="How long callers wait before hanging up – used in Erlang-A"
      />

      <NumberStepper
        label="OOO Shrinkage (%)"
        value={settings.oooShrinkagePct}
        min={0} max={50}
        onChange={(v) => onChange({ oooShrinkagePct: v })}
        help="Leave, training, absence buffer applied on top of required agents"
      />

      <RadioGroup
        label="Weekly Off Pattern"
        value={settings.offPattern}
        options={[
          { value: 'Consecutive Off Days', label: 'Consecutive' },
          { value: 'Split Off Days',       label: 'Split (e.g. Mon/Thu)' },
          { value: 'Single Day Off',       label: 'Single Day' },
        ]}
        onChange={(v) => onChange({ offPattern: v })}
        help="Whether agents receive consecutive or split weekly off days"
      />

      <RadioGroup
        label="Lunch Duration"
        value={settings.lunchDuration}
        options={[
          { value: '30 minutes',      label: '30 minutes' },
          { value: '1 hour',          label: '1 hour' },
          { value: '1 hour 30 minutes', label: '1 hr 30 min' },
        ]}
        onChange={(v) => onChange({ lunchDuration: v })}
      />

      {/* Shift window */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Earliest Start</label>
          <input
            type="time"
            className="input font-mono"
            value={settings.earliestShiftStart}
            onChange={(e) => onChange({ earliestShiftStart: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Latest Start</label>
          <input
            type="time"
            className="input font-mono"
            value={settings.latestShiftStart}
            onChange={(e) => onChange({ latestShiftStart: e.target.value })}
          />
        </div>
      </div>

      <NumberStepper
        label="Max Agents Cap"
        value={settings.maxAgentsCap}
        min={10} max={5000} step={10}
        onChange={(v) => onChange({ maxAgentsCap: v })}
      />
    </div>
  )
}
