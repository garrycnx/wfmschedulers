import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (user: User, token: string) => void
  logout: () => void
  updateUser: (partial: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      setAuth: (user, token) =>
        set((state) => {
          // If a DIFFERENT user is logging in, wipe their previous store data
          if (state.user && state.user.id !== user.id) {
            localStorage.removeItem('wfm-schedule')
            localStorage.removeItem(`wfm-schedule-${state.user.id}`)
          }
          return { user, token, isAuthenticated: true }
        }),

      logout: () => {
        // Clear schedule data on logout so next user starts fresh
        localStorage.removeItem('wfm-schedule')
        set({ user: null, token: null, isAuthenticated: false })
      },

      updateUser: (partial) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),
    }),
    {
      name: 'wfm-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
