import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { History, ChevronDown } from 'lucide-react'
import { changeLogApi } from '../api/client'

interface ChangeLogEntry {
  id:              string
  organizationId:  string
  performedById:   string | null
  performedByName: string
  agentId:         string | null
  entityType:      string
  action:          string
  description:     string
  createdAt:       string
}

const ACTION_BADGE: Record<string, string> = {
  created:   'bg-green-100 text-green-700',
  updated:   'bg-blue-100 text-blue-700',
  deleted:   'bg-red-100 text-red-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
  published: 'bg-indigo-100 text-indigo-700',
}

function groupByDay(entries: ChangeLogEntry[]): { date: string; items: ChangeLogEntry[] }[] {
  const map: Record<string, ChangeLogEntry[]> = {}
  for (const entry of entries) {
    const day = new Date(entry.createdAt).toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    if (!map[day]) map[day] = []
    map[day].push(entry)
  }
  return Object.entries(map).map(([date, items]) => ({ date, items }))
}

export default function ChangeLog() {
  const [searchParams] = useSearchParams()
  const agentId = searchParams.get('agentId') ?? undefined

  const [entries, setEntries]     = useState<ChangeLogEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [hasMore, setHasMore]     = useState(false)
  const [limit, setLimit]         = useState(50)

  const fetchEntries = useCallback(async (lim: number) => {
    setLoading(true)
    try {
      const data = await changeLogApi.list({ agentId, limit: lim })
      setEntries(data)
      setHasMore(data.length === lim)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => { fetchEntries(limit) }, [fetchEntries, limit])

  function loadMore() {
    const newLimit = limit + 50
    setLimit(newLimit)
  }

  const groups = groupByDay(entries)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center">
          <History className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Change Log</h1>
          <p className="text-sm text-gray-500">
            {agentId ? 'Showing changes for selected agent' : 'All recent changes in your organisation'}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading && entries.length === 0 ? (
          <div className="text-center text-gray-400 py-12 text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="text-center text-gray-400 py-12 text-sm">No changes recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="wfm-table w-full">
              <thead>
                <tr>
                  <th className="text-left w-44">Date / Time</th>
                  <th className="text-left">Performed By</th>
                  <th className="text-left">Action</th>
                  <th className="text-left">Description</th>
                  <th className="text-left">Entity</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(({ date, items }) => (
                  <>
                    {/* Date separator */}
                    <tr key={`sep-${date}`}>
                      <td colSpan={5} className="bg-gray-50 px-4 py-2 border-t border-b border-gray-100">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{date}</span>
                      </td>
                    </tr>
                    {items.map(entry => (
                      <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                        <td className="text-xs text-gray-500 whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="text-sm font-medium text-gray-800">{entry.performedByName}</td>
                        <td>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ACTION_BADGE[entry.action] ?? 'bg-gray-100 text-gray-600'}`}>
                            {entry.action}
                          </span>
                        </td>
                        <td className="text-sm text-gray-700 max-w-xs truncate">{entry.description}</td>
                        <td>
                          <span className="text-xs font-medium text-gray-500 capitalize">{entry.entityType}</span>
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Load More */}
        {hasMore && !loading && (
          <div className="flex justify-center py-4 border-t border-gray-100">
            <button
              onClick={loadMore}
              className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-500 transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
              Load More
            </button>
          </div>
        )}
        {loading && entries.length > 0 && (
          <div className="text-center text-gray-400 py-4 text-sm">Loading…</div>
        )}
      </div>
    </div>
  )
}
