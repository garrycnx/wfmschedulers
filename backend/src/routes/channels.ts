import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/database'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// GET /api/channel-assignments
router.get('/channel-assignments', async (req: AuthRequest, res: Response) => {
  const orgId   = req.user!.organizationId
  const { agentId, date } = req.query

  const where: Record<string, unknown> = {
    organizationId: orgId ?? undefined,
  }
  if (agentId) where.agentId = String(agentId)
  if (date) {
    const d = new Date(String(date))
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    where.date = { gte: start, lt: end }
  }

  const assignments = await prisma.channelAssignment.findMany({
    where,
    include: { agent: { select: { id: true, name: true, agentCode: true } } },
    orderBy: [{ agentId: 'asc' }, { slotMin: 'asc' }],
  })
  res.json(assignments)
})

// POST /api/channel-assignments – bulk upsert
router.post('/channel-assignments', async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    assignments: z.array(z.object({
      agentId:    z.string(),
      scheduleId: z.string().optional(),
      date:       z.string(),
      slotMin:    z.number().int().min(0).max(1410),
      channel:    z.enum(['voice', 'chat', 'email', 'backoffice']),
    })),
  })
  const { assignments } = Schema.parse(req.body)
  const orgId = req.user!.organizationId ?? 'default'

  const results = await Promise.all(
    assignments.map(a =>
      prisma.channelAssignment.upsert({
        where: {
          // Use a composite approach: find by agentId+date+slotMin, but since there's no @@unique,
          // we do createMany / deleteMany pattern via findFirst + update/create
          id: 'nonexistent', // This forces a create — we handle via findFirst below
        },
        update: {},
        create: {
          agentId:        a.agentId,
          scheduleId:     a.scheduleId,
          date:           new Date(a.date),
          slotMin:        a.slotMin,
          channel:        a.channel,
          organizationId: orgId,
        },
      }).catch(async () => {
        // Upsert by agentId + date + slotMin
        const dateObj = new Date(a.date)
        const start = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
        const end   = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + 1)
        const existing = await prisma.channelAssignment.findFirst({
          where: { agentId: a.agentId, slotMin: a.slotMin, date: { gte: start, lt: end } },
        })
        if (existing) {
          return prisma.channelAssignment.update({
            where: { id: existing.id },
            data: { channel: a.channel, scheduleId: a.scheduleId },
          })
        }
        return prisma.channelAssignment.create({
          data: {
            agentId:        a.agentId,
            scheduleId:     a.scheduleId,
            date:           new Date(a.date),
            slotMin:        a.slotMin,
            channel:        a.channel,
            organizationId: orgId,
          },
        })
      })
    )
  )
  res.status(201).json({ count: results.length })
})

// Simpler bulk upsert using delete+insert pattern
router.put('/channel-assignments', async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    agentId:     z.string(),
    date:        z.string(),
    assignments: z.array(z.object({
      slotMin:    z.number().int().min(0).max(1410),
      channel:    z.enum(['voice', 'chat', 'email', 'backoffice']),
      scheduleId: z.string().optional(),
    })),
  })
  const { agentId, date, assignments } = Schema.parse(req.body)
  const orgId   = req.user!.organizationId ?? 'default'
  const dateObj = new Date(date)
  const start   = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
  const end     = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + 1)

  // Delete existing for this agent+day
  await prisma.channelAssignment.deleteMany({
    where: { agentId, date: { gte: start, lt: end }, organizationId: orgId },
  })

  // Insert new
  const created = await prisma.channelAssignment.createMany({
    data: assignments.map(a => ({
      agentId,
      date:           new Date(date),
      slotMin:        a.slotMin,
      channel:        a.channel,
      scheduleId:     a.scheduleId,
      organizationId: orgId,
    })),
  })
  res.status(201).json({ count: created.count })
})

// DELETE /api/channel-assignments/:id
router.delete('/channel-assignments/:id', async (req: AuthRequest, res: Response) => {
  await prisma.channelAssignment.delete({ where: { id: req.params.id } })
  res.json({ success: true })
})

export default router
