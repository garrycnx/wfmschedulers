import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/database'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

const SaveScheduleSchema = z.object({
  name: z.string().min(1),
  weekStartDate: z.string(),
  settingsJson: z.string(),
  forecastJson: z.string(),
  requiredJson: z.string(),
  agentsJson: z.string(),
  projectionsJson: z.string(),
  rosterJson: z.string(),
  breaksJson: z.string(),
})

// GET /api/schedules
router.get('/', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId
  const schedules = await prisma.schedule.findMany({
    where: orgId ? { organizationId: orgId } : { createdBy: req.user!.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, weekStartDate: true, status: true,
      createdBy: true, createdAt: true, updatedAt: true,
      projectionsJson: true,
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
      organizationId: orgId,
      createdBy: req.user!.id,
    },
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
    },
  })
  res.json(schedule)
})

// POST /api/schedules/:id/publish
router.post('/:id/publish', async (req: AuthRequest, res: Response) => {
  const schedule = await prisma.schedule.update({
    where: { id: req.params.id },
    data: { status: 'published' },
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
