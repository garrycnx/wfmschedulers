import { prisma } from '../config/database'

export async function logChange(opts: {
  organizationId: string
  performedById?: string
  performedByName: string
  agentId?: string
  entityType: string
  action: string
  description: string
}) {
  try {
    await prisma.changeLog.create({ data: opts })
  } catch (err) {
    // Non-critical: log errors silently so they don't break main operations
    console.error('[logChange] Failed to write changelog entry:', err)
  }
}
