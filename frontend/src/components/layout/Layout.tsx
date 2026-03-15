import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      {/* Main area shifts based on sidebar width */}
      <motion.div
        animate={{ marginLeft: collapsed ? 72 : 240 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="flex-1 flex flex-col min-w-0 overflow-hidden"
      >
        <Header />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          <motion.div
            key={window.location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </motion.div>
    </div>
  )
}
