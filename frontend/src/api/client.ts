import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

// In dev the Vite proxy forwards /api → localhost:5000 (no VITE_API_URL needed).
// In production set VITE_API_URL=https://wfmschedulers-api.azurewebsites.net
const API_BASE = `${import.meta.env.VITE_API_URL ?? ''}/api`

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT to every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 (token expired)
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
      toast.error('Session expired. Please sign in again.')
    }
    return Promise.reject(err)
  },
)

// ─── API helpers ─────────────────────────────────────────────────────────────
export const agentsApi = {
  list: () => apiClient.get('/agents'),
  get: (id: string) => apiClient.get(`/agents/${id}`),
  create: (data: unknown) => apiClient.post('/agents', data),
  update: (id: string, data: unknown) => apiClient.put(`/agents/${id}`, data),
  delete: (id: string) => apiClient.delete(`/agents/${id}`),
  invitePortal: (id: string) => apiClient.post(`/agents/${id}/invite`),
}

export const schedulesApi = {
  list: () => apiClient.get('/schedules'),
  get: (id: string) => apiClient.get(`/schedules/${id}`),
  save: (data: unknown) => apiClient.post('/schedules', data),
  update: (id: string, data: unknown) => apiClient.put(`/schedules/${id}`, data),
  publish: (id: string) => apiClient.post(`/schedules/${id}/publish`),
  archive: (id: string) => apiClient.post(`/schedules/${id}/archive`),
  delete: (id: string) => apiClient.delete(`/schedules/${id}`),
}

export const authApi = {
  googleLogin: (accessToken: string) =>
    apiClient.post<{ user: import('../types').User; token: string }>('/auth/google', {
      access_token: accessToken,
    }),
  me: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout'),
}
