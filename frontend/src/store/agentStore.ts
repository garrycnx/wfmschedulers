import { create } from 'zustand'
import { agentsApi } from '../api/client'
import type { Agent, AgentFormData } from '../types'

interface AgentStore {
  agents: Agent[]
  loading: boolean
  fetchAgents: () => Promise<void>
  addAgent: (data: AgentFormData) => Promise<void>
  updateAgent: (id: string, data: AgentFormData) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
}

export const useAgentStore = create<AgentStore>()((set) => ({
  agents: [],
  loading: false,

  fetchAgents: async () => {
    set({ loading: true })
    try {
      const res = await agentsApi.list()
      set({ agents: res.data as Agent[], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  addAgent: async (data) => {
    const res = await agentsApi.create(data)
    set((s) => ({ agents: [res.data as Agent, ...s.agents] }))
  },

  updateAgent: async (id, data) => {
    const res = await agentsApi.update(id, data)
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? (res.data as Agent) : a)),
    }))
  },

  deleteAgent: async (id) => {
    await agentsApi.delete(id)
    set((s) => ({ agents: s.agents.filter((a) => a.id !== id) }))
  },
}))
