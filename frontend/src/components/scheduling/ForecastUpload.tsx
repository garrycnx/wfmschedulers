import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import { motion } from 'framer-motion'
import { UploadCloud, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { ForecastRow, ScheduleSettings } from '../../types'
import { WEEKDAYS } from '../../types'

interface Props {
  onParsed: (rows: ForecastRow[]) => void
  settings: ScheduleSettings
}

function parseWeekday(dateStr: string): string | null {
  try {
    // Support DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY
    let d: Date
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
      const [day, month, year] = dateStr.split('-')
      d = new Date(`${year}-${month}-${day}`)
    } else {
      d = new Date(dateStr)
    }
    if (isNaN(d.getTime())) return null
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]
  } catch { return null }
}

function timeToMin(s: string): number | null {
  if (!s) return null
  const clean = s.includes(' ') ? s.split(' ').pop()! : s
  const parts = clean.split(':')
  if (parts.length < 2) return null
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

function minToTime(m: number): string {
  const h = Math.floor(m / 60) % 24
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export default function ForecastUpload({ onParsed, settings }: Props) {
  const [status, setStatus] = useState<'idle' | 'parsing' | 'success' | 'error'>('idle')
  const [summary, setSummary] = useState<{ rows: number; days: number; slots: number } | null>(null)
  const [fileName, setFileName] = useState('')

  const parseFile = useCallback((file: File) => {
    setFileName(file.name)
    setStatus('parsing')

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rawData = results.data as Record<string, string>[]
          const cols: Record<string, string> = {}
          for (const key of Object.keys(rawData[0] ?? {})) {
            const k = key.toLowerCase()
            if (k.includes('date')) cols['date'] = key
            if (k.includes('interval') || k.includes('time') || k.includes('slot')) cols['interval'] = cols['interval'] ?? key
            if (k.includes('volume') || k.includes('calls') || k.includes('forecast')) cols['volume'] = key
          }

          if (!cols['date'] || !cols['interval'] || !cols['volume']) {
            toast.error('CSV must have date, interval, and volume columns.')
            setStatus('error')
            return
          }

          // Detect interval
          const slotMins = rawData.map((r) => timeToMin(r[cols['interval']])).filter((v): v is number => v !== null)
          const unique = [...new Set(slotMins)].sort((a, b) => a - b)
          const diffs = unique.slice(1).map((v, i) => v - unique[i])
          if (diffs.length) {
            const common = diffs.sort((a, b) =>
              diffs.filter((v) => v === b).length - diffs.filter((v) => v === a).length,
            )[0]
            const detected = common === 15 ? '15 minutes' : '30 minutes'
            if (detected !== settings.intervalFormat) {
              toast.error(`Interval mismatch: CSV has ${detected} but you selected ${settings.intervalFormat}.`)
              setStatus('error')
              return
            }
          }

          // Aggregate by weekday + slot
          const agg: Map<string, number> = new Map()
          for (const row of rawData) {
            const wd = parseWeekday(row[cols['date']])
            const sm = timeToMin(row[cols['interval']])
            if (!wd || sm === null) continue
            const vol = parseFloat(row[cols['volume']]) || 0
            const key = `${wd}|${sm}`
            agg.set(key, (agg.get(key) ?? 0) + vol)
          }

          const allSlots = [...new Set([...agg.keys()].map((k) => parseInt(k.split('|')[1])))].sort((a, b) => a - b)
          const rows: ForecastRow[] = []

          for (const wd of WEEKDAYS) {
            for (const sm of allSlots) {
              const vol = agg.get(`${wd}|${sm}`) ?? 0
              rows.push({ weekday: wd as any, slotMin: sm, slotLabel: minToTime(sm), volume: vol })
            }
          }

          setSummary({ rows: rows.length, days: new Set(rows.map((r) => r.weekday)).size, slots: allSlots.length })
          setStatus('success')
          onParsed(rows)
        } catch (e) {
          console.error(e)
          toast.error('Failed to parse CSV.')
          setStatus('error')
        }
      },
      error: () => { toast.error('Could not read file.'); setStatus('error') },
    })
  }, [settings.intervalFormat, onParsed])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    onDrop: (accepted) => { if (accepted[0]) parseFile(accepted[0]) },
  })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Upload Forecast CSV</h3>
          <p className="text-xs text-gray-500 mt-1">
            One week of data with columns: <code className="text-brand-600">date</code> (DD-MM-YYYY),{' '}
            <code className="text-brand-600">interval</code> (HH:MM), <code className="text-brand-600">volume</code>
          </p>
        </div>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={clsx(
            'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200',
            isDragActive
              ? 'border-brand-400 bg-brand-50'
              : status === 'success'
              ? 'border-emerald-400/60 bg-emerald-50'
              : status === 'error'
              ? 'border-red-400/60 bg-red-50'
              : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50',
          )}
        >
          <input {...getInputProps()} />
          <motion.div
            animate={{ scale: isDragActive ? 1.05 : 1 }}
            className="flex flex-col items-center gap-3"
          >
            {status === 'success' ? (
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            ) : status === 'error' ? (
              <AlertCircle className="w-10 h-10 text-red-500" />
            ) : (
              <UploadCloud className={clsx('w-10 h-10', isDragActive ? 'text-brand-500' : 'text-gray-400')} />
            )}

            {status === 'success' && summary ? (
              <div>
                <p className="text-sm font-semibold text-emerald-700">{fileName} loaded</p>
                <p className="text-xs text-gray-500 mt-1">
                  {summary.rows} rows · {summary.days} days · {summary.slots} intervals
                </p>
              </div>
            ) : status === 'error' ? (
              <div>
                <p className="text-sm font-semibold text-red-600">Upload failed</p>
                <p className="text-xs text-gray-500 mt-1">Click or drop a new file to retry</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {isDragActive ? 'Drop it!' : 'Drag & drop or click to browse'}
                </p>
                <p className="text-xs text-gray-500 mt-1">CSV only · max 200 MB</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Format guide */}
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">Expected format:</p>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left pb-1">date</th>
                <th className="text-left pb-1">interval</th>
                <th className="text-left pb-1">volume</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr><td>10-03-2026</td><td>08:00</td><td>42</td></tr>
              <tr><td>10-03-2026</td><td>08:30</td><td>65</td></tr>
              <tr><td>10-03-2026</td><td>09:00</td><td>88</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
