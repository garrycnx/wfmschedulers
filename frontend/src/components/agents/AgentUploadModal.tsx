import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  X, Upload, Download, CheckCircle, AlertCircle, FileSpreadsheet, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '../../api/client'
import type { LineOfBusiness } from '../../types'

// ─── Template columns (must match COLUMN_MAP keys) ───────────────────────────
const TEMPLATE_HEADERS = [
  'Name', 'Email', 'Employee Code', 'Phone',
  'Skill', 'Status', 'Team', 'Hire Date (DD/MM/YYYY)', 'LOB Name',
]

const EXAMPLE_ROW = [
  'John Smith', 'john@example.com', 'EMP001', '+1234567890',
  'mid', 'active', 'Team A', '16/03/2026', 'BMO',
]

// ─── Column name → AgentFormData field mapping ────────────────────────────────
const COLUMN_MAP: Record<string, string> = {
  'name':                   'name',
  'email':                  'email',
  'employee code':          'employeeCode',
  'phone':                  'phone',
  'skill':                  'skill',
  'status':                 'status',
  'team':                   'team',
  'hire date (dd/mm/yyyy)': 'hireDate',
  'hire date':              'hireDate',
  'lob name':               'lobName',
  'lob':                    'lobName',
}

const VALID_SKILLS   = ['junior', 'mid', 'senior', 'lead']
const VALID_STATUSES = ['active', 'inactive', 'on_leave']

interface ParsedRow {
  name: string
  email: string
  employeeCode?: string
  phone?: string
  skill: string
  status: string
  team?: string
  hireDate: string
  lobName?: string
  lobId?: string
  errors: string[]
}

interface Props {
  open: boolean
  lobs: LineOfBusiness[]
  onClose: () => void
  onSuccess: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseExcelDate(raw: unknown): string {
  if (!raw) return ''
  // Excel serial number
  if (typeof raw === 'number') {
    const date = XLSX.SSF.parse_date_code(raw)
    if (date) {
      return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`
    }
  }
  const s = String(raw).trim()
  // DD/MM/YYYY
  const ddmm = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return s
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AgentUploadModal({ open, lobs, onClose, onSuccess }: Props) {
  const fileRef   = useRef<HTMLInputElement>(null)
  const dropRef   = useRef<HTMLDivElement>(null)
  const [dragging, setDragging]   = useState(false)
  const [rows,     setRows]       = useState<ParsedRow[]>([])
  const [fileName, setFileName]   = useState('')
  const [uploading, setUploading] = useState(false)
  const [result,   setResult]     = useState<{ created: number; failed: { row: number; name: string; error: string }[] } | null>(null)

  // ── Download template ────────────────────────────────────────────────────
  function downloadTemplate() {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, EXAMPLE_ROW])
    // Column widths
    ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Agents')
    XLSX.writeFile(wb, 'agents_template.xlsx')
  }

  // ── Parse file ──────────────────────────────────────────────────────────
  function parseFile(file: File) {
    setResult(null)
    setRows([])
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array', cellDates: false })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const raw  = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        if (raw.length === 0) { toast.error('The file is empty.'); return }

        // Build LOB name → id map
        const lobMap: Record<string, string> = {}
        for (const l of lobs) lobMap[l.name.toLowerCase()] = l.id

        const parsed: ParsedRow[] = raw.map(rawRow => {
          // Normalise keys
          const row: Record<string, string> = {}
          for (const [k, v] of Object.entries(rawRow)) {
            const mapped = COLUMN_MAP[k.toLowerCase().trim()]
            if (mapped) row[mapped] = String(v ?? '').trim()
          }

          const errors: string[] = []
          if (!row.name)    errors.push('Name is required')
          if (!row.email)   errors.push('Email is required')
          if (!row.email?.includes('@')) errors.push('Invalid email')
          if (!VALID_SKILLS.includes(row.skill?.toLowerCase()))
            errors.push(`Skill must be one of: ${VALID_SKILLS.join(', ')}`)
          if (!VALID_STATUSES.includes(row.status?.toLowerCase()))
            errors.push(`Status must be one of: ${VALID_STATUSES.join(', ')}`)

          const hireDate = parseExcelDate(rawRow['Hire Date (DD/MM/YYYY)'] ?? rawRow['Hire Date'] ?? row.hireDate)
          if (!hireDate) errors.push('Hire Date is required')

          // Resolve LOB name → id
          const lobId = row.lobName ? lobMap[row.lobName.toLowerCase()] : undefined
          if (row.lobName && !lobId)
            errors.push(`LOB "${row.lobName}" not found — will be skipped`)

          return {
            name:         row.name ?? '',
            email:        row.email ?? '',
            employeeCode: row.employeeCode || undefined,
            phone:        row.phone || undefined,
            skill:        row.skill?.toLowerCase() ?? '',
            status:       row.status?.toLowerCase() ?? '',
            team:         row.team || undefined,
            hireDate,
            lobName:      row.lobName || undefined,
            lobId:        lobId || undefined,
            errors,
          }
        })
        setRows(parsed)
      } catch {
        toast.error('Failed to parse file. Please use the provided template.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) parseFile(file)
  }

  // ── Upload ───────────────────────────────────────────────────────────────
  async function handleUpload() {
    const validRows = rows.filter(r => r.errors.length === 0)
    if (validRows.length === 0) { toast.error('No valid rows to upload.'); return }
    setUploading(true)
    try {
      const payload = validRows.map(r => ({
        name:         r.name,
        email:        r.email,
        employeeCode: r.employeeCode,
        phone:        r.phone,
        skill:        r.skill,
        status:       r.status,
        team:         r.team,
        hireDate:     r.hireDate,
        lobId:        r.lobId ?? null,
      }))
      const res = await apiClient.post<{ created: number; failed: { row: number; name: string; error: string }[] }>(
        '/agents/bulk', { agents: payload }
      )
      setResult(res.data)
      if (res.data.created > 0) {
        toast.success(`${res.data.created} agent${res.data.created !== 1 ? 's' : ''} created successfully!`)
        onSuccess()
      }
    } catch {
      toast.error('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  function handleClose() {
    setRows([]); setFileName(''); setResult(null)
    onClose()
  }

  const validCount   = rows.filter(r => r.errors.length === 0).length
  const invalidCount = rows.filter(r => r.errors.length  > 0).length

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.22 }}
            className="fixed inset-x-4 top-[5%] bottom-[5%] z-50 max-w-4xl mx-auto bg-white
                       rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="font-bold text-gray-900">Import Agents from Excel</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Download the template, fill it in, then upload to create agents in bulk
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-1.5 text-xs font-semibold text-brand-600
                             hover:text-brand-700 border border-brand-200 hover:border-brand-400
                             rounded-lg px-3 py-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Template
                </button>
                <button onClick={handleClose}
                  className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-5">

              {/* Drop zone */}
              {!result && (
                <div
                  ref={dropRef}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
                    ${dragging ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-brand-300 hover:bg-gray-50'}`}
                >
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                    onChange={handleFileInput} />
                  <FileSpreadsheet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  {fileName ? (
                    <p className="text-sm font-semibold text-brand-600">{fileName}</p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-gray-700">
                        Drop your Excel file here, or click to browse
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Supports .xlsx, .xls, .csv</p>
                    </>
                  )}
                </div>
              )}

              {/* Template column guide */}
              {rows.length === 0 && !result && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Required columns in the Excel file:</p>
                  <div className="flex flex-wrap gap-2">
                    {TEMPLATE_HEADERS.map(h => (
                      <span key={h} className="text-[11px] bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-gray-600 font-mono">
                        {h}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    Skill: junior / mid / senior / lead &nbsp;·&nbsp;
                    Status: active / inactive / on_leave
                  </p>
                </div>
              )}

              {/* Preview table */}
              {rows.length > 0 && !result && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {validCount > 0 && (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
                          <CheckCircle className="w-3.5 h-3.5" /> {validCount} valid
                        </span>
                      )}
                      {invalidCount > 0 && (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">
                          <AlertCircle className="w-3.5 h-3.5" /> {invalidCount} with errors
                        </span>
                      )}
                    </div>
                    <button onClick={() => { setRows([]); setFileName('') }}
                      className="text-xs text-gray-400 hover:text-gray-600 underline">
                      Clear
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-3 py-2 font-semibold text-gray-500">#</th>
                          <th className="px-3 py-2 font-semibold text-gray-500">Name</th>
                          <th className="px-3 py-2 font-semibold text-gray-500">Email</th>
                          <th className="px-3 py-2 font-semibold text-gray-500">Code</th>
                          <th className="px-3 py-2 font-semibold text-gray-500">Skill</th>
                          <th className="px-3 py-2 font-semibold text-gray-500">Status</th>
                          <th className="px-3 py-2 font-semibold text-gray-500">Team</th>
                          <th className="px-3 py-2 font-semibold text-gray-500">LOB</th>
                          <th className="px-3 py-2 font-semibold text-gray-500">Hire Date</th>
                          <th className="px-3 py-2 font-semibold text-gray-500">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} className={`border-t border-gray-100 ${row.errors.length ? 'bg-red-50' : ''}`}>
                            <td className="px-3 py-2 text-gray-400">{i + 2}</td>
                            <td className="px-3 py-2 font-medium text-gray-900">{row.name || <span className="text-red-400">—</span>}</td>
                            <td className="px-3 py-2 text-gray-600">{row.email || <span className="text-red-400">—</span>}</td>
                            <td className="px-3 py-2 text-gray-500 font-mono">{row.employeeCode || 'auto'}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold
                                ${VALID_SKILLS.includes(row.skill) ? 'bg-brand-50 text-brand-700' : 'bg-red-100 text-red-600'}`}>
                                {row.skill || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold
                                ${VALID_STATUSES.includes(row.status) ? 'bg-emerald-50 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                {row.status || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-500">{row.team || '—'}</td>
                            <td className="px-3 py-2 text-gray-500">{row.lobName || '—'}</td>
                            <td className="px-3 py-2 text-gray-500">{row.hireDate || <span className="text-red-400">—</span>}</td>
                            <td className="px-3 py-2">
                              {row.errors.length === 0 ? (
                                <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                                  <CheckCircle className="w-3.5 h-3.5" /> OK
                                </span>
                              ) : (
                                <span className="text-red-500 text-[10px]" title={row.errors.join('; ')}>
                                  <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                                  {row.errors[0]}{row.errors.length > 1 ? ` +${row.errors.length - 1}` : ''}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Upload result */}
              {result && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-emerald-800">
                        {result.created} agent{result.created !== 1 ? 's' : ''} created successfully
                      </p>
                      {result.failed.length > 0 && (
                        <p className="text-xs text-emerald-600 mt-0.5">
                          {result.failed.length} row{result.failed.length !== 1 ? 's' : ''} skipped due to errors
                        </p>
                      )}
                    </div>
                  </div>
                  {result.failed.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                      <p className="text-xs font-semibold text-red-700">Skipped rows:</p>
                      {result.failed.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-red-600">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>Row {f.row} · <strong>{f.name}</strong> — {f.error}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 shrink-0">
              <button onClick={handleClose}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50">
                {result ? 'Close' : 'Cancel'}
              </button>
              {!result && rows.length > 0 && validCount > 0 && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold
                             bg-brand-600 hover:bg-brand-500 text-white transition-all disabled:opacity-50"
                >
                  {uploading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                    : <><Upload className="w-4 h-4" /> Upload {validCount} Agent{validCount !== 1 ? 's' : ''}</>
                  }
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
