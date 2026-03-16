import { create } from 'zustand'
import axios from 'axios'
import type { LineOfBusiness } from '../types'

const API = `${import.meta.env.VITE_API_URL ?? ''}/api/lobs`

function authHeader() {
  const raw = localStorage.getItem('wfm-auth')
  const token = raw ? JSON.parse(raw).state?.token : ''
  return { Authorization: `Bearer ${token}` }
}

interface LobStore {
  lobs: LineOfBusiness[]
  loading: boolean
  fetchLobs: () => Promise<void>
  addLob: (data: { name: string; description?: string; color: string }) => Promise<LineOfBusiness>
  updateLob: (id: string, data: { name: string; description?: string; color: string }) => Promise<void>
  deleteLob: (id: string) => Promise<void>
}

export const useLobStore = create<LobStore>((set) => ({
  lobs:    [],
  loading: false,

  fetchLobs: async () => {
    set({ loading: true })
    try {
      const res = await axios.get<LineOfBusiness[]>(API, { headers: authHeader() })
      set({ lobs: res.data })
    } finally {
      set({ loading: false })
    }
  },

  addLob: async (data) => {
    const res = await axios.post<LineOfBusiness>(API, data, { headers: authHeader() })
    set((s) => ({ lobs: [...s.lobs, res.data] }))
    return res.data
  },

  updateLob: async (id, data) => {
    const res = await axios.put<LineOfBusiness>(`${API}/${id}`, data, { headers: authHeader() })
    set((s) => ({ lobs: s.lobs.map((l) => (l.id === id ? res.data : l)) }))
  },

  deleteLob: async (id) => {
    await axios.delete(`${API}/${id}`, { headers: authHeader() })
    set((s) => ({ lobs: s.lobs.filter((l) => l.id !== id) }))
  },
}))
