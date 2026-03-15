import { motion } from 'framer-motion'
import {
  Users, CalendarCheck, TrendingUp, PhoneCall,
  Activity, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Plus, ChevronRight,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// Mock data – will be replaced by API calls
const kpiData = [
  { label: 'Total Agents',      value: '248',  change: '+12',  up: true,  icon: Users,        color: 'brand'   },
  { label: 'Active Schedules',  value: '7',    change: '+2',   up: true,  icon: CalendarCheck, color: 'emerald' },
  { label: 'Weekly SLA',        value: '82.4%',change: '+1.2%',up: true,  icon: TrendingUp,   color: 'sky'     },
  { label: 'Avg Occupancy',     value: '76.3%',change: '-2.1%',up: false, icon: Activity,     color: 'violet'  },
]

const slaWeekData = [
  { day: 'Mon', sla: 83, abandon: 4.2, occupancy: 78 },
  { day: 'Tue', sla: 81, abandon: 4.8, occupancy: 75 },
  { day: 'Wed', sla: 85, abandon: 3.9, occupancy: 71 },
  { day: 'Thu', sla: 80, abandon: 5.1, occupancy: 80 },
  { day: 'Fri', sla: 78, abandon: 5.8, occupancy: 84 },
  { day: 'Sat', sla: 88, abandon: 2.9, occupancy: 63 },
  { day: 'Sun', sla: 91, abandon: 2.1, occupancy: 55 },
]

const volumeData = [
  { slot: '08:00', calls: 42 },
  { slot: '09:00', calls: 88 },
  { slot: '10:00', calls: 120 },
  { slot: '11:00', calls: 105 },
  { slot: '12:00', calls: 78 },
  { slot: '13:00', calls: 65 },
  { slot: '14:00', calls: 110 },
  { slot: '15:00', calls: 132 },
  { slot: '16:00', calls: 98 },
  { slot: '17:00', calls: 72 },
]

const recentSchedules = [
  { id: '1', name: 'Week 11 – Mar 2026', status: 'published', agents: 248, sla: 82.4 },
  { id: '2', name: 'Week 10 – Feb 2026', status: 'archived',  agents: 231, sla: 79.8 },
  { id: '3', name: 'Week 12 – Draft',    status: 'draft',     agents: 260, sla: 84.1 },
]

const statusColors: Record<string, string> = {
  published: 'badge-green',
  draft: 'badge-yellow',
  archived: 'badge-slate',
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35 } }),
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Good morning, {user?.name?.split(' ')[0]} 👋
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Here's your workforce snapshot for this week.</p>
        </div>
        <button
          onClick={() => navigate('/generate')}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold
                     rounded-xl px-4 py-2.5 text-sm transition-all duration-200 shadow-glow-sm"
        >
          <Plus className="w-4 h-4" />
          New Schedule
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiData.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            custom={i}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center
                bg-${kpi.color}-500/15 border border-${kpi.color}-500/20`}>
                <kpi.icon className={`w-5 h-5 text-${kpi.color}-500`} />
              </div>
              <span className={`flex items-center gap-1 text-xs font-semibold
                ${kpi.up ? 'text-emerald-600' : 'text-red-500'}`}>
                {kpi.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {kpi.change}
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-xs text-gray-500 mt-1">{kpi.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* SLA trend */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Weekly Performance</h3>
              <p className="text-xs text-gray-500 mt-0.5">SLA % and Abandon % by day</p>
            </div>
            <span className="badge-brand text-[10px]">This week</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={slaWeekData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSla" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6370fa" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6370fa" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradAbandon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f87171" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10 }}
                labelStyle={{ color: '#374151', fontSize: 12 }}
                itemStyle={{ fontSize: 12 }}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Area type="monotone" dataKey="sla" name="SLA %" stroke="#6370fa" fill="url(#gradSla)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="abandon" name="Abandon %" stroke="#f87171" fill="url(#gradAbandon)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Volume chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gray-900">Intraday Volume</h3>
            <p className="text-xs text-gray-500 mt-0.5">Calls by hour (today)</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={volumeData} margin={{ top: 5, right: 0, left: -30, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="slot" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10 }}
                labelStyle={{ color: '#374151', fontSize: 12 }}
                itemStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="calls" fill="#6370fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent schedules */}
      <div className="bg-white border border-gray-200 rounded-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Recent Schedules</h3>
            <p className="text-xs text-gray-500 mt-0.5">Latest generated rosters</p>
          </div>
          <button
            onClick={() => navigate('/schedules')}
            className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-500 transition-colors font-medium"
          >
            View all <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <table className="wfm-table w-full">
          <thead>
            <tr>
              <th className="text-left">Schedule Name</th>
              <th className="text-center">Status</th>
              <th className="text-center">Agents</th>
              <th className="text-center">Proj. SLA</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recentSchedules.map((s) => (
              <tr key={s.id} className="cursor-pointer" onClick={() => navigate(`/schedules/${s.id}`)}>
                <td className="font-medium">{s.name}</td>
                <td className="text-center">
                  <span className={statusColors[s.status]}>{s.status}</span>
                </td>
                <td className="text-center text-gray-700">{s.agents}</td>
                <td className="text-center">
                  <span className={s.sla >= 80 ? 'text-emerald-600' : 'text-amber-600'}>
                    {s.sla}%
                  </span>
                </td>
                <td className="text-right">
                  <button className="text-xs text-brand-600 hover:text-brand-500 font-medium transition-colors">
                    Open →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alert banner */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-700">Understaffed alert – Friday 15:00–17:00</p>
          <p className="text-xs text-amber-600/80 mt-0.5">
            Projected SLA drops to 74% due to 3 agents on leave. Consider reassigning a shift or approving overtime.
          </p>
        </div>
      </div>
    </div>
  )
}
