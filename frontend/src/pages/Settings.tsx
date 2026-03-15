import { useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

export default function Settings() {
  const user = useAuthStore((s) => s.user)
  const [orgName, setOrgName] = useState('My Organisation')
  const [tz, setTz] = useState('Europe/London')

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      {/* Profile */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-gray-900">Profile</h3>
        <div className="flex items-center gap-4">
          <img
            src={user?.picture ?? `https://ui-avatars.com/api/?name=${user?.name}&background=4f4ef0&color=fff`}
            className="w-14 h-14 rounded-2xl object-cover ring-2 ring-brand-600/30"
            alt={user?.name}
          />
          <div>
            <p className="font-semibold text-gray-900">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <span className="badge-brand mt-1">{user?.role ?? 'manager'}</span>
          </div>
        </div>
      </div>

      {/* Organisation */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-gray-900">Organisation</h3>
        <div>
          <label className="label">Organisation Name</label>
          <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        </div>
        <div>
          <label className="label">Timezone</label>
          <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
            <option value="Europe/London">Europe/London (UTC+0/+1)</option>
            <option value="America/New_York">America/New_York (UTC-5/-4)</option>
            <option value="America/Chicago">America/Chicago (UTC-6/-5)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (UTC-8/-7)</option>
            <option value="Asia/Kolkata">Asia/Kolkata (UTC+5:30)</option>
            <option value="Asia/Dubai">Asia/Dubai (UTC+4)</option>
            <option value="Australia/Sydney">Australia/Sydney (UTC+10/+11)</option>
          </select>
        </div>
        <button
          onClick={() => toast.success('Settings saved.')}
          className="bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-all"
        >
          Save Changes
        </button>
      </div>

      {/* Azure / Database */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-gray-900">Azure Integration</h3>
        <p className="text-sm text-gray-500">
          Configure your Azure SQL connection string and Blob Storage for schedule exports.
        </p>
        <div>
          <label className="label">SQL Connection String</label>
          <input className="input font-mono text-xs" type="password" placeholder="Server=…;Database=…;User Id=…" />
        </div>
        <div>
          <label className="label">Storage Account Name</label>
          <input className="input" placeholder="wfmschedules" />
        </div>
        <button
          onClick={() => toast.success('Connection tested successfully.')}
          className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-xl px-5 py-2.5 text-sm transition-all"
        >
          Test Connection
        </button>
      </div>
    </div>
  )
}
