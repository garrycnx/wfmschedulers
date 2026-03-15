import { useLocation } from 'react-router-dom'
import { Bell, Search } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

const ROUTE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/dashboard':  { title: 'Dashboard',         subtitle: 'Overview of your workforce metrics' },
  '/generate':   { title: 'Generate Schedule', subtitle: 'Upload forecast and build optimised rosters' },
  '/agents':     { title: 'Agent Management',  subtitle: 'Manage your workforce and create agent accounts' },
  '/schedules':  { title: 'Schedule History',  subtitle: 'View, edit, and publish saved schedules' },
  '/settings':   { title: 'Settings',          subtitle: 'Configure your organisation preferences' },
}

export default function Header() {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)

  const routeInfo = ROUTE_TITLES[location.pathname] ?? { title: 'WFM Club', subtitle: '' }

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-gray-200 bg-white backdrop-blur-sm shrink-0">
      {/* Title */}
      <div>
        <h1 className="text-base font-bold text-gray-900 leading-none">{routeInfo.title}</h1>
        {routeInfo.subtitle && (
          <p className="text-xs text-gray-500 mt-0.5">{routeInfo.subtitle}</p>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <button className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-all">
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Quick search…</span>
          <kbd className="hidden sm:block text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
        </button>

        {/* Notifications */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-all">
          <Bell className="w-4 h-4" />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-brand-500 rounded-full" />
        </button>

        {/* Avatar */}
        <img
          src={user?.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=4f4ef0&color=fff`}
          alt={user?.name}
          className="w-9 h-9 rounded-xl object-cover ring-2 ring-brand-600/30"
        />
      </div>
    </header>
  )
}
