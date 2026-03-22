import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { format, parseISO } from 'date-fns'
import type { IntervalDataPoint } from '../../api/forecastApi'

interface IntervalHeatmapProps {
  intervalData: IntervalDataPoint[]
  timeSlots: string[]
  onSelectDay: (date: string) => void
  selectedDay: string | null
}

export default function IntervalHeatmap({ intervalData, timeSlots, onSelectDay, selectedDay }: IntervalHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ date: string; time: string; calls: number } | null>(null)
  // Adaptive cell height: 15-min (48 slots) → compact, 30-min (24 slots) → normal
  const cellHeight = timeSlots.length > 30 ? 'h-5' : 'h-7'

  // Build a lookup map: date → time → calls
  const dataMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    intervalData.forEach(d => {
      if (!map[d.date]) map[d.date] = {}
      map[d.date][d.time] = d.calls
    })
    return map
  }, [intervalData])

  // Get unique sorted dates
  const dates = useMemo(() => [...new Set(intervalData.map(d => d.date))].sort(), [intervalData])

  // Find min/max for color scale
  const { minCalls, maxCalls } = useMemo(() => {
    const vals = intervalData.map(d => d.calls).filter(v => v > 0)
    return { minCalls: Math.min(...vals), maxCalls: Math.max(...vals) }
  }, [intervalData])

  const getColor = (calls: number): string => {
    if (calls === 0) return '#f9fafb'
    const ratio = (calls - minCalls) / Math.max(1, maxCalls - minCalls)
    // Blue (low) → Indigo → Purple → Red (high)
    if (ratio < 0.25) return `rgb(${Math.round(147 + ratio * 4 * 60)}, ${Math.round(210 - ratio * 4 * 60)}, 255)`
    if (ratio < 0.5)  return `rgb(${Math.round(99 + (ratio - 0.25) * 4 * 100)}, ${Math.round(102 + (ratio - 0.25) * 4 * 50)}, ${Math.round(241 - (ratio - 0.25) * 4 * 40)})`
    if (ratio < 0.75) return `rgb(${Math.round(199 + (ratio - 0.5) * 4 * 40)}, ${Math.round(152 - (ratio - 0.5) * 4 * 80)}, ${Math.round(201 - (ratio - 0.5) * 4 * 80)})`
    return `rgb(${Math.round(239)}, ${Math.round(68 - (ratio - 0.75) * 4 * 30)}, ${Math.round(68 - (ratio - 0.75) * 4 * 30)})`
  }

  const getTextColor = (calls: number): string => {
    const ratio = (calls - minCalls) / Math.max(1, maxCalls - minCalls)
    return ratio > 0.5 ? '#ffffff' : '#374151'
  }

  // Show max 14 days to keep it readable; for longer ranges show weekly averages
  const displayDates = dates.slice(0, 14)
  const showingSubset = dates.length > 14

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Interval Heatmap</h3>
          <p className="text-xs text-gray-500">Call volume by time of day × date — click a column to view detail</p>
        </div>
        {showingSubset && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">Showing first 14 days of {dates.length}</span>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>Low</span>
        <div className="flex h-3 w-24 rounded overflow-hidden">
          {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((r, i) => (
            <div key={i} className="flex-1" style={{ backgroundColor: getColor(minCalls + r * (maxCalls - minCalls)) }} />
          ))}
        </div>
        <span>High</span>
        <span className="ml-2 text-gray-400">({minCalls.toLocaleString()} – {maxCalls.toLocaleString()} calls)</span>
      </div>

      {/* Heatmap Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Date headers */}
          <div className="flex">
            <div className="w-14 shrink-0" /> {/* time label column */}
            {displayDates.map(d => (
              <button
                key={d}
                onClick={() => onSelectDay(d)}
                className={clsx(
                  'flex-1 min-w-[44px] text-center text-xs py-1.5 font-medium border-b-2 transition-colors',
                  selectedDay === d ? 'text-indigo-700 border-indigo-600 bg-indigo-50' : 'text-gray-500 border-transparent hover:text-indigo-600 hover:border-indigo-300'
                )}
              >
                <div>{format(parseISO(d), 'EEE')}</div>
                <div className="text-gray-400 font-normal">{format(parseISO(d), 'M/d')}</div>
              </button>
            ))}
          </div>

          {/* Time rows */}
          {timeSlots.map(slot => (
            <div key={slot} className="flex items-center">
              <div className="w-14 shrink-0 text-xs text-gray-400 pr-2 text-right py-0.5">{slot}</div>
              {displayDates.map(d => {
                const calls = dataMap[d]?.[slot] ?? 0
                const isHovered = hoveredCell?.date === d && hoveredCell?.time === slot
                return (
                  <div
                    key={d}
                    onClick={() => onSelectDay(d)}
                    onMouseEnter={() => setHoveredCell({ date: d, time: slot, calls })}
                    onMouseLeave={() => setHoveredCell(null)}
                    className={clsx(
                      `flex-1 min-w-[44px] ${cellHeight} flex items-center justify-center text-[10px] font-medium cursor-pointer transition-all border border-white`,
                      isHovered && 'ring-2 ring-indigo-400 ring-inset z-10 relative'
                    )}
                    style={{ backgroundColor: getColor(calls), color: getTextColor(calls) }}
                  >
                    {calls > 0 ? calls.toLocaleString() : ''}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredCell && (
        <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 inline-block">
          <span className="font-semibold">{format(parseISO(hoveredCell.date), 'EEE, MMM d')}</span>
          {' '}{hoveredCell.time}
          {' — '}<span className="text-indigo-300 font-bold">{hoveredCell.calls.toLocaleString()} calls</span>
        </div>
      )}
    </div>
  )
}
