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

export const leaveApi = {
  // Quotas
  listQuotas: (lobId?: string) => apiClient.get(`/leave-quotas${lobId ? `?lobId=${lobId}` : ''}`),
  createQuota: (data: unknown) => apiClient.post('/leave-quotas', data),
  updateQuota: (id: string, data: unknown) => apiClient.put(`/leave-quotas/${id}`, data),
  deleteQuota: (id: string) => apiClient.delete(`/leave-quotas/${id}`),
  // Requests
  listRequests: (params?: { status?: string; agentId?: string }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.agentId) q.set('agentId', params.agentId)
    return apiClient.get(`/leave-requests${q.toString() ? `?${q}` : ''}`)
  },
  createRequest: (data: unknown) => apiClient.post('/leave-requests', data),
  approveRequest: (id: string) => apiClient.patch(`/leave-requests/${id}/approve`),
  rejectRequest:  (id: string) => apiClient.patch(`/leave-requests/${id}/reject`),
  // Balances
  getBalances: (agentId: string, year?: number) =>
    apiClient.get(`/leave-balances/${agentId}${year ? `?year=${year}` : ''}`),
  listBalances: (year?: number) =>
    apiClient.get(`/leave-balances${year ? `?year=${year}` : ''}`),
  allocateBalance: (data: unknown) => apiClient.post('/leave-balances', data),
}

export const channelApi = {
  list: (params?: { agentId?: string; date?: string }) => {
    const q = new URLSearchParams()
    if (params?.agentId) q.set('agentId', params.agentId)
    if (params?.date)    q.set('date', params.date)
    return apiClient.get(`/channel-assignments${q.toString() ? `?${q}` : ''}`)
  },
  bulkUpsert: (agentId: string, date: string, assignments: unknown[]) =>
    apiClient.put('/channel-assignments', { agentId, date, assignments }),
  delete: (id: string) => apiClient.delete(`/channel-assignments/${id}`),
}
