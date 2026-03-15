import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import axios from 'axios'
import { useAuthStore } from '../../store/authStore'
import { apiClient } from '../../api/client'
import type { User } from '../../types'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export default function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, setAuth } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  // Always call the hook (React rules) — button is hidden when no client ID
  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      const toastId = toast.loading('Signing you in…')
      try {
        const res = await apiClient.post<{ user: User; token: string }>(
          '/auth/google',
          { access_token: tokenResponse.access_token },
        )
        setAuth(res.data.user, res.data.token)
        toast.dismiss(toastId)
        toast.success(`Welcome back, ${res.data.user.name.split(' ')[0]}!`)
        navigate(res.data.user.role === 'agent' ? '/agent-portal' : '/dashboard', { replace: true })
      } catch {
        try {
          const profile = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
          })
          const g = profile.data as { id: string; email: string; name: string; picture: string }
          const user: User = {
            id: g.id, email: g.email, name: g.name, picture: g.picture,
            role: 'manager', createdAt: new Date().toISOString(),
          }
          setAuth(user, `demo-token-${g.id}`)
          toast.dismiss(toastId)
          toast.success(`Welcome, ${g.name.split(' ')[0]}!`)
          navigate('/dashboard', { replace: true })
        } catch {
          toast.dismiss(toastId)
          toast.error('Sign-in failed. Please try again.')
        }
      }
    },
    onError: () => toast.error('Google sign-in was cancelled.'),
    scope: 'openid email profile',
  })

  return (
    <div className="login-bg min-h-screen flex items-center justify-center p-4">
      {/* Background grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(#6370fa 1px, transparent 1px), linear-gradient(90deg, #6370fa 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Glow orbs */}
      <div className="pointer-events-none fixed top-1/4 left-1/4 w-96 h-96 rounded-full bg-brand-700/20 blur-[120px]" />
      <div className="pointer-events-none fixed bottom-1/4 right-1/3 w-80 h-80 rounded-full bg-brand-500/10 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo / Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 shadow-glow mb-5">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">WFM Club</h1>
          <p className="mt-2 text-slate-400 text-sm">AI-Powered Enterprise Scheduling</p>
        </div>

        {/* Card */}
        <div className="card-glass p-8">
          <h2 className="text-xl font-semibold text-white mb-1">Sign in to your workspace</h2>
          <p className="text-slate-400 text-sm mb-8">
            Use your Google account to access your organisation's scheduling platform.
          </p>

          {/* Google button — active only when client ID is baked in at build time */}
          {GOOGLE_CLIENT_ID ? (
            <button
              onClick={() => login()}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800
                         font-semibold rounded-xl px-5 py-3.5 text-sm transition-all duration-200
                         shadow-md hover:shadow-lg active:scale-[0.98]"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          ) : (
            <div className="w-full flex items-center justify-center gap-3 bg-white/10 text-slate-400
                            rounded-xl px-5 py-3.5 text-sm border border-white/10 cursor-not-allowed">
              <GoogleIcon />
              Google sign-in not configured
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-slate-600 text-xs">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {/* Agent portal link */}
          <p className="mt-6 text-center text-sm text-slate-500">
            Are you an agent?{' '}
            <a
              href="/agent-portal"
              className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
            >
              View your schedule →
            </a>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-6">
          Developed by{' '}
          <a href="https://www.wfmclubs.com" target="_blank" rel="noreferrer"
             className="text-slate-500 hover:text-slate-400 transition-colors">
            Gurpreet Singh · WFM Club
          </a>
        </p>
      </motion.div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
