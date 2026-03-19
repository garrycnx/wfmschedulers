import { Router, Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { logChange } from '../utils/logChange'

const router = Router()
router.use(requireAuth)

const SaveScheduleSchema = z.object({
  name: z.string().min(1),
  weekStartDate: z.string(),
  fromDate: z.string().optional().nullable(),
  toDate: z.string().optional().nullable(),
  lobId: z.string().optional().nullable(),
  settingsJson: z.string(),
  forecastJson: z.string(),
  requiredJson: z.string(),
  agentsJson: z.string(),
  projectionsJson: z.string(),
  rosterJson: z.string(),
  breaksJson: z.string(),
})

// GET /api/schedules?from=2026-03-01&to=2026-03-31&lobId=xxx
router.get('/', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId
  const { from, to, lobId } = req.query

  const where: Prisma.ScheduleWhereInput = orgId
    ? { organizationId: orgId }
    : { createdBy: req.user!.id }

  if (from && to) {
    const fromDate = new Date((from as string) + 'T00:00:00Z')
    const toDate   = new Date((to   as string) + 'T23:59:59Z')
    where.OR = [
      // Schedules with explicit fromDate/toDate range set
      { fromDate: { lte: toDate }, toDate: { gte: fromDate } },
      // Fallback: schedules without fromDate/toDate – use weekStartDate in range
      { fromDate: null, toDate: null, weekStartDate: { gte: fromDate, lte: toDate } },
    ]
  }
  if (lobId) where.lobId = lobId as string

  const schedules = await prisma.schedule.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, weekStartDate: true, fromDate: true, toDate: true,
      lobId: true, status: true, createdBy: true, createdAt: true, updatedAt: true,
      settingsJson: true, forecastJson: true, projectionsJson: true, agentsJson: true,
      rosterJson: true, requiredJson: true,
    },
  })
  res.json(schedules)
})

// GET /api/schedules/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const schedule = await prisma.schedule.findUnique({ where: { id: req.params.id } })
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' })
  res.json(schedule)
})

// POST /api/schedules – save a new schedule
router.post('/', async (req: AuthRequest, res: Response) => {
  const data = SaveScheduleSchema.parse(req.body)
  const orgId = req.user!.organizationId ?? 'default'
  const schedule = await prisma.schedule.create({
    data: {
      ...data,
      weekStartDate: new Date(data.weekStartDate),
      fromDate: data.fromDate ? new Date(data.fromDate) : null,
      toDate:   data.toDate   ? new Date(data.toDate)   : null,
      lobId:    data.lobId ?? null,
      organizationId: orgId,
      createdBy: req.user!.id,
    },
  })
  await logChange({
    organizationId:  orgId,
    performedById:   req.user!.id,
    performedByName: req.user!.name,
    entityType:      'schedule',
    action:          'created',
    description:     `Schedule "${schedule.name}" was created`,
  })
  res.status(201).json(schedule)
})

// PUT /api/schedules/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const data = SaveScheduleSchema.partial().parse(req.body)
  const schedule = await prisma.schedule.update({
    where: { id: req.params.id },
    data: {
      ...data,
      weekStartDate: data.weekStartDate ? new Date(data.weekStartDate) : undefined,
      fromDate: data.fromDate ? new Date(data.fromDate) : data.fromDate === null ? null : undefined,
      toDate:   data.toDate   ? new Date(data.toDate)   : data.toDate   === null ? null : undefined,
      lobId:    data.lobId !== undefined ? (data.lobId ?? null) : undefined,
    },
  })
  res.json(schedule)
})

// POST /api/schedules/:id/publish
router.post('/:id/publish', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId ?? 'default'
  const schedule = await prisma.schedule.update({
    where: { id: req.params.id },
    data: { status: 'published' },
  })
  await logChange({
    organizationId:  orgId,
    performedById:   req.user!.id,
    performedByName: req.user!.name,
    entityType:      'schedule',
    action:          'published',
    description:     `Schedule "${schedule.name}" was published`,
  })
  res.json(schedule)
})

// POST /api/schedules/:id/archive
router.post('/:id/archive', async (req: AuthRequest, res: Response) => {
  const schedule = await prisma.schedule.update({
    where: { id: req.params.id },
    data: { status: 'archived' },
  })
  res.json(schedule)
})

// DELETE /api/schedules/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.schedule.delete({ where: { id: req.params.id } })
  res.json({ success: true })
})

export default router
