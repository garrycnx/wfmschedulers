import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { clsx } from 'clsx'
import {
  LayoutDashboard, CalendarDays, Users, History,
  Settings, LogOut, ChevronLeft, ChevronRight,
  Sparkles, ExternalLink, Briefcase, CalendarOff,
  Users2,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard',          roles: ['admin', 'manager', 'viewer'] },
  { to: '/generate',   icon: Sparkles,        label: 'Generate Schedule',  roles: ['admin', 'manager'] },
  { to: '/agents',     icon: Users,           label: 'Agents',             roles: ['admin', 'manager', 'viewer'] },
  { to: '/lobs',       icon: Briefcase,       label: 'Lines of Business',  roles: ['admin', 'manager'] },
  { to: '/schedules',  icon: History,         label: 'Schedule History',   roles: ['admin', 'manager', 'viewer'] },
  { to: '/leave',      icon: CalendarOff,     label: 'Leave Management',   roles: ['admin', 'manager', 'viewer'] },
  { to: '/users',      icon: Users2,          label: 'User Management',    roles: ['admin', 'manager'] },
  { to: '/changelog',  icon: History,         label: 'Change Log',         roles: ['admin', 'manager', 'viewer'] },
  { to: '/settings',   icon: Settings,        label: 'Settings',           roles: ['admin', 'manager'] },
]

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const userRole = user?.role ?? 'manager'

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="fixed left-0 top-0 h-screen z-30 flex flex-col
                 bg-white border-r border-gray-200 overflow-hidden"
    >
      {/* Logo row */}
      <div className={clsx('flex items-center h-16 px-4 shrink-0', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-glow-sm">
              <CalendarDays className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-none">WFM Club</p>
              <p className="text-[10px] text-gray-500 mt-0.5">AI Scheduler</p>
            </div>
          </motion.div>
        )}

        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-glow-sm">
            <CalendarDays className="w-4 h-4 text-white" />
          </div>
        )}

        <button
          onClick={onToggle}
          className={clsx(
            'flex items-center justify-center w-7 h-7 rounded-lg text-gray-500 hover:text-gray-700',
            'hover:bg-gray-100 transition-colors',
            collapsed && 'hidden',
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={onToggle}
          className="mx-auto mb-2 flex items-center justify-center w-7 h-7 rounded-lg
                     text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {navItems.filter(item => item.roles.includes(userRole)).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-brand-50 text-brand-700 border border-brand-200'
                  : 'text-gray-600 hover:bg-gray-100',
                collapsed && 'justify-center px-2',
              )
            }
            title={collapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                <Icon className={clsx('w-5 h-5 shrink-0', isActive ? 'text-brand-600' : 'text-gray-400 group-hover:text-gray-600')} />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            )}
          </NavLink>
        ))}

        {/* Agent portal link */}
        <a
          href="/agent-portal"
          target="_blank"
          rel="noreferrer"
          className={clsx(
            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
            'text-gray-600 hover:bg-gray-100 transition-all duration-150 group',
            collapsed && 'justify-center px-2',
          )}
          title={collapsed ? 'Agent Portal' : undefined}
        >
          <ExternalLink className="w-5 h-5 shrink-0 text-gray-400 group-hover:text-gray-600" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden whitespace-nowrap"
              >
                Agent Portal
              </motion.span>
            )}
          </AnimatePresence>
        </a>
      </nav>

      {/* User + logout */}
      <div className={clsx('px-2 pb-4 pt-2 border-t border-gray-200 shrink-0', collapsed && 'px-1')}>
        {!collapsed && user && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1">
            <img
              src={user.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=4f4ef0&color=fff`}
              alt={user.name}
              className="w-8 h-8 rounded-full object-cover ring-2 ring-brand-600/40"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{user.name}</p>
              <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className={clsx(
            'flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium',
            'text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all duration-150',
            collapsed && 'justify-center px-2',
          )}
          title={collapsed ? 'Sign Out' : undefined}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </motion.aside>
  )
}
