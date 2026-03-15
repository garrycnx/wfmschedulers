import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1 },
  },
})

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

const toasterProps = {
  position: 'top-right' as const,
  toastOptions: {
    duration: 4000,
    style: {
      background: '#1e293b',
      color: '#f1f5f9',
      border: '1px solid #334155',
      borderRadius: '10px',
      fontSize: '14px',
      fontWeight: 500,
    },
    success: { iconTheme: { primary: '#6370fa', secondary: '#fff' } },
    error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
  },
}

const AppTree = (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
      <Toaster {...toasterProps} />
    </BrowserRouter>
  </QueryClientProvider>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {GOOGLE_CLIENT_ID
      ? <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{AppTree}</GoogleOAuthProvider>
      : AppTree
    }
  </React.StrictMode>,
)
