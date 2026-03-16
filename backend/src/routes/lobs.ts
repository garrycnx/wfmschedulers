import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/database'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

const LobSchema = z.object({
  name:        z.string().min(1, 'Name is required'),
  description: z.string().optional().nullable(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
})

// GET /api/lobs
router.get('/', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId
  const lobs = await prisma.lineOfBusiness.findMany({
    where: orgId ? { organizationId: orgId } : {},
    orderBy: { name: 'asc' },
    include: { _count: { select: { agents: true, schedules: true } } },
  })
  res.json(lobs)
})

// GET /api/lobs/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const lob = await prisma.lineOfBusiness.findUnique({
    where: { id: req.params.id },
    include: {
      agents:    { select: { id: true, name: true, agentCode: true, status: true } },
      schedules: { select: { id: true, name: true, status: true, weekStartDate: true }, orderBy: { createdAt: 'desc' }, take: 10 },
      _count:    { select: { agents: true, schedules: true } },
    },
  })
  if (!lob) return res.status(404).json({ error: 'LOB not found' })
  res.json(lob)
})

// POST /api/lobs
router.post('/', async (req: AuthRequest, res: Response) => {
  const data = LobSchema.parse(req.body)
  const orgId = req.user!.organizationId ?? 'default'

  // Duplicate name check
  const existing = await prisma.lineOfBusiness.findFirst({
    where: { name: { equals: data.name, mode: 'insensitive' }, organizationId: orgId },
  })
  if (existing) {
    return res.status(409).json({ error: `A Line of Business named "${data.name}" already exists.` })
  }

  const lob = await prisma.lineOfBusiness.create({
    data: { ...data, organizationId: orgId },
  })
  res.status(201).json(lob)
})

// PUT /api/lobs/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const data = LobSchema.parse(req.body)
  const orgId = req.user!.organizationId ?? 'default'

  // Duplicate name check (exclude self)
  const conflict = await prisma.lineOfBusiness.findFirst({
    where: {
      name: { equals: data.name, mode: 'insensitive' },
      organizationId: orgId,
      NOT: { id: req.params.id },
    },
  })
  if (conflict) {
    return res.status(409).json({ error: `A Line of Business named "${data.name}" already exists.` })
  }

  const lob = await prisma.lineOfBusiness.update({
    where: { id: req.params.id },
    data,
  })
  res.json(lob)
})

// DELETE /api/lobs/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  // Unassign agents from this LOB before deleting
  await prisma.agent.updateMany({
    where: { lobId: req.params.id },
    data:  { lobId: null },
  })
  await prisma.lineOfBusiness.delete({ where: { id: req.params.id } })
  res.json({ success: true })
})

export default router
