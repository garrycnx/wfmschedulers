import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import LoginPage from './components/auth/LoginPage'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import ScheduleGenerator from './pages/ScheduleGenerator'
import AgentManagement from './pages/AgentManagement'
import LobManagement from './pages/LobManagement'
import MySchedule from './pages/MySchedule'
import ScheduleHistory from './pages/ScheduleHistory'
import ScheduleDetail from './pages/ScheduleDetail'
import AgentPortal from './pages/AgentPortal'
import Settings from './pages/Settings'
import LeaveManagement from './pages/LeaveManagement'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'agent') return <Navigate to="/agent-portal" replace />
  return <>{children}</>
}

export default function App() {
  const user = useAuthStore((s) => s.user)

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/agent-portal" element={<AgentPortal />} />

      {/* Manager / Admin shell */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AdminRoute>
              <Layout />
            </AdminRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="generate" element={<ScheduleGenerator />} />
        <Route path="agents" element={<AgentManagement />} />
        <Route path="lobs" element={<LobManagement />} />
        <Route path="schedules" element={<ScheduleHistory />} />
        <Route path="schedules/:id" element={<ScheduleDetail />} />
        <Route path="leave" element={<LeaveManagement />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}
