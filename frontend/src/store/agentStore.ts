import { create } from 'zustand'
import type { Agent, AgentFormData } from '../types'

const MOCK_AGENTS: Agent[] = [
  { id: '1', agentCode: 'AG001', name: 'Alice Johnson',  email: 'alice@example.com', status: 'active',   skill: 'senior', team: 'Team A', hireDate: '2022-03-01', organizationId: 'org1', createdAt: '', updatedAt: '' },
  { id: '2', agentCode: 'AG002', name: 'Bob Martinez',   email: 'bob@example.com',   status: 'active',   skill: 'mid',    team: 'Team A', hireDate: '2023-01-15', organizationId: 'org1', createdAt: '', updatedAt: '' },
  { id: '3', agentCode: 'AG003', name: 'Carol Singh',    email: 'carol@example.com', status: 'active',   skill: 'junior', team: 'Team B', hireDate: '2024-02-10', organizationId: 'org1', createdAt: '', updatedAt: '' },
  { id: '4', agentCode: 'AG004', name: 'David Okafor',   email: 'david@example.com', status: 'on_leave', skill: 'mid',    team: 'Team B', hireDate: '2021-11-20', organizationId: 'org1', createdAt: '', updatedAt: '' },
  { id: '5', agentCode: 'AG005', name: 'Eva Chen',       email: 'eva@example.com',   status: 'active',   skill: 'lead',   team: 'Team C', hireDate: '2020-06-05', organizationId: 'org1', createdAt: '', updatedAt: '' },
  { id: '6', agentCode: 'AG006', name: 'Frank Patel',    email: 'frank@example.com', status: 'inactive', skill: 'junior', team: 'Team C', hireDate: '2023-09-01', organizationId: 'org1', createdAt: '', updatedAt: '' },
]

interface AgentStore {
  agents: Agent[]
  addAgent: (data: AgentFormData) => void
  updateAgent: (id: string, data: Partial<Agent>) => void
  deleteAgent: (id: string) => void
}

export const useAgentStore = create<AgentStore>()((set, get) => ({
  agents: MOCK_AGENTS,

  addAgent: (data) => {
    const agents = get().agents
    const autoCode = `AG${String(agents.length + 1).padStart(3, '0')}`
    const newAgent: Agent = {
      id: String(Date.now()),
      agentCode: data.employeeCode?.trim() || autoCode,
      ...data,
      organizationId: 'org1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    set((s) => ({ agents: [...s.agents, newAgent] }))
  },

  updateAgent: (id, data) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id ? { ...a, ...data, updatedAt: new Date().toISOString() } : a,
      ),
    })),

  deleteAgent: (id) =>
    set((s) => ({ agents: s.agents.filter((a) => a.id !== id) })),
}))
