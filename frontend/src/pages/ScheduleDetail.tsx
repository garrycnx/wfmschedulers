import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function ScheduleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/schedules')}
          className="p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-base font-bold text-gray-900">Schedule #{id}</h2>
      </div>

      <div className="card p-12 text-center">
        <p className="text-gray-500 text-sm">Full schedule detail view coming soon.</p>
        <p className="text-gray-400 text-xs mt-2">
          Will include editable roster, break viewer, and impact analysis for published schedules.
        </p>
      </div>
    </div>
  )
}
