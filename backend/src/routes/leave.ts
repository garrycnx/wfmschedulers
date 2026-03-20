import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/database'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { logChange } from '../utils/logChange'

const router = Router()
router.use(requireAuth)

// ─── Leave Quotas ─────────────────────────────────────────────────────────────

// GET /api/leave-quotas
router.get('/leave-quotas', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId
  const { lobId } = req.query
  const quotas = await prisma.leaveQuota.findMany({
    where: {
      organizationId: orgId ?? undefined,
      ...(lobId ? { lobId: String(lobId) } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(quotas)
})

// POST /api/leave-quotas
router.post('/leave-quotas', async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    lobId:       z.string().optional().nullable(),
    leaveType:   z.enum(['Annual', 'Sick', 'Emergency', 'Unpaid']),
    totalHours:  z.number().positive(),
    periodStart: z.string(),
    periodEnd:   z.string(),
    maxPerDay:   z.number().int().min(1).default(3),
  })
  const data  = Schema.parse(req.body)
  const orgId = req.user!.organizationId ?? 'default'
  const quota = await prisma.leaveQuota.create({
    data: {
      ...data,
      periodStart: new Date(data.periodStart),
      periodEnd:   new Date(data.periodEnd),
      organizationId: orgId,
    },
  })
  res.status(201).json(quota)
})

// PUT /api/leave-quotas/:id
router.put('/leave-quotas/:id', async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    lobId:       z.string().optional().nullable(),
    leaveType:   z.enum(['Annual', 'Sick', 'Emergency', 'Unpaid']).optional(),
    totalHours:  z.number().positive().optional(),
    periodStart: z.string().optional(),
    periodEnd:   z.string().optional(),
    maxPerDay:   z.number().int().min(1).optional(),
  })
  const data = Schema.parse(req.body)
  const quota = await prisma.leaveQuota.update({
    where: { id: req.params.id },
    data: {
      ...data,
      ...(data.periodStart ? { periodStart: new Date(data.periodStart) } : {}),
      ...(data.periodEnd   ? { periodEnd:   new Date(data.periodEnd)   } : {}),
    },
  })
  res.json(quota)
})

// DELETE /api/leave-quotas/:id
router.delete('/leave-quotas/:id', async (req: AuthRequest, res: Response) => {
  await prisma.leaveQuota.delete({ where: { id: req.params.id } })
  res.json({ success: true })
})

// ─── Leave Requests ───────────────────────────────────────────────────────────

// GET /api/leave-requests
router.get('/leave-requests', async (req: AuthRequest, res: Response) => {
  const orgId   = req.user!.organizationId
  const { status, agentId } = req.query
  const requests = await prisma.leaveRequest.findMany({
    where: {
      organizationId: orgId ?? undefined,
      ...(status  ? { status:  String(status)  } : {}),
      ...(agentId ? { agentId: String(agentId) } : {}),
    },
    include: { agent: { select: { id: true, name: true, agentCode: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  })
  res.json(requests)
})

// POST /api/leave-requests – agent submits request
router.post('/leave-requests', async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    agentId:      z.string(),
    leaveType:    z.enum(['Annual', 'Sick', 'Emergency', 'Unpaid']),
    startDate:    z.string(),
    endDate:      z.string(),
    durationType: z.enum(['full_day', 'half_day_am', 'half_day_pm']),
    totalHours:   z.number().positive(),
    notes:        z.string().optional(),
  })
  const data  = Schema.parse(req.body)
  const orgId = req.user!.organizationId ?? 'default'

  // Validate against balance
  const year    = new Date(data.startDate).getFullYear()
  const balance = await prisma.leaveBalance.findUnique({
    where: { agentId_leaveType_year: { agentId: data.agentId, leaveType: data.leaveType, year } },
  })
  if (balance) {
    const remaining = balance.totalHours - balance.usedHours
    if (data.totalHours > remaining) {
      return res.status(400).json({
        error: `Insufficient ${data.leaveType} leave balance. Available: ${remaining}h, Requested: ${data.totalHours}h`,
      })
    }
  }

  // Check max per day
  const startDate = new Date(data.startDate)
  const endDate   = new Date(data.endDate)
  const quota = await prisma.leaveQuota.findFirst({
    where: { organizationId: orgId, leaveType: data.leaveType },
    orderBy: { createdAt: 'desc' },
  })
  if (quota) {
    const overlapping = await prisma.leaveRequest.count({
      where: {
        organizationId: orgId,
        leaveType:      data.leaveType,
        status:         'approved',
        startDate:      { lte: endDate },
        endDate:        { gte: startDate },
      },
    })
    if (overlapping >= quota.maxPerDay) {
      return res.status(400).json({
        error: `Maximum ${quota.maxPerDay} agents can take ${data.leaveType} leave on overlapping days.`,
      })
    }
  }

  const request = await prisma.leaveRequest.create({
    data: {
      ...data,
      startDate: new Date(data.startDate),
      endDate:   new Date(data.endDate),
      organizationId: orgId,
    },
    include: { agent: { select: { id: true, name: true, agentCode: true, email: true } } },
  })
  res.status(201).json(request)
})

// PATCH /api/leave-requests/:id/approve
router.patch('/leave-requests/:id/approve', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Request not found' })
  if (existing.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' })

  // Deduct from balance
  const year = new Date(existing.startDate).getFullYear()
  await prisma.leaveBalance.upsert({
    where: { agentId_leaveType_year: { agentId: existing.agentId, leaveType: existing.leaveType, year } },
    update: { usedHours: { increment: existing.totalHours } },
    create: {
      agentId:        existing.agentId,
      leaveType:      existing.leaveType,
      year,
      totalHours:     0,
      usedHours:      existing.totalHours,
      organizationId: existing.organizationId,
    },
  })

  const updated = await prisma.leaveRequest.update({
    where: { id: req.params.id },
    data: {
      status:     'approved',
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
    },
    include: { agent: { select: { id: true, name: true, agentCode: true, email: true } } },
  })
  await logChange({
    organizationId:  existing.organizationId,
    performedById:   req.user!.id,
    performedByName: req.user!.name,
    agentId:         existing.agentId,
    entityType:      'leave',
    action:          'approved',
    description:     `Leave request for "${updated.agent.name}" (${existing.leaveType}) was approved`,
  })
  res.json(updated)
})

// PATCH /api/leave-requests/:id/reject
router.patch('/leave-requests/:id/reject', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Request not found' })
  if (existing.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' })

  const updated = await prisma.leaveRequest.update({
    where: { id: req.params.id },
    data: {
      status:     'rejected',
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
    },
    include: { agent: { select: { id: true, name: true, agentCode: true, email: true } } },
  })
  await logChange({
    organizationId:  existing.organizationId,
    performedById:   req.user!.id,
    performedByName: req.user!.name,
    agentId:         existing.agentId,
    entityType:      'leave',
    action:          'rejected',
    description:     `Leave request for "${updated.agent.name}" (${existing.leaveType}) was rejected`,
  })
  res.json(updated)
})

// ─── Leave Balances ───────────────────────────────────────────────────────────

// GET /api/leave-balances/:agentId
router.get('/leave-balances/:agentId', async (req: AuthRequest, res: Response) => {
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear()
  const balances = await prisma.leaveBalance.findMany({
    where: { agentId: req.params.agentId, year },
  })
  res.json(balances)
})

// GET /api/leave-balances – all balances for org (manager view)
router.get('/leave-balances', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId
  const year  = req.query.year ? Number(req.query.year) : new Date().getFullYear()
  const balances = await prisma.leaveBalance.findMany({
    where: { organizationId: orgId ?? undefined, year },
    include: { agent: { select: { id: true, name: true, agentCode: true } } },
    orderBy: [{ agent: { name: 'asc' } }, { leaveType: 'asc' }],
  })
  res.json(balances)
})

// POST /api/leave-balances – manager allocates hours
router.post('/leave-balances', async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    agentId:    z.string(),
    leaveType:  z.enum(['Annual', 'Sick', 'Emergency', 'Unpaid']),
    totalHours: z.number().min(0),
    year:       z.number().int().optional(),
  })
  const data  = Schema.parse(req.body)
  const year  = data.year ?? new Date().getFullYear()
  const orgId = req.user!.organizationId ?? 'default'

  const balance = await prisma.leaveBalance.upsert({
    where: { agentId_leaveType_year: { agentId: data.agentId, leaveType: data.leaveType, year } },
    update: { totalHours: data.totalHours },
    create: {
      agentId:        data.agentId,
      leaveType:      data.leaveType,
      totalHours:     data.totalHours,
      usedHours:      0,
      year,
      organizationId: orgId,
    },
  })
  res.status(201).json(balance)
})

// ─── Leave Type Config ────────────────────────────────────────────────────────

// GET /api/leave-types
router.get('/leave-types', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId
  const types = await prisma.leaveTypeConfig.findMany({
    where: { organizationId: orgId ?? undefined },
    orderBy: { name: 'asc' },
  })
  res.json(types)
})

// POST /api/leave-types
router.post('/leave-types', async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    name:        z.string().min(1).max(50),
    description: z.string().optional().nullable(),
    color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
    isPaid:      z.boolean().default(true),
    isActive:    z.boolean().default(true),
  })
  const data  = Schema.parse(req.body)
  const orgId = req.user!.organizationId ?? 'default'
  try {
    const leaveType = await prisma.leaveTypeConfig.create({
      data: { ...data, organizationId: orgId },
    })
    res.status(201).json(leaveType)
  } catch {
    res.status(400).json({ error: 'A leave type with this name already exists.' })
  }
})

// PUT /api/leave-types/:id
router.put('/leave-types/:id', async (req: AuthRequest, res: Response) => {
  const Schema = z.object({
    name:        z.string().min(1).max(50).optional(),
    description: z.string().optional().nullable(),
    color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    isPaid:      z.boolean().optional(),
    isActive:    z.boolean().optional(),
  })
  const data = Schema.parse(req.body)
  try {
    const leaveType = await prisma.leaveTypeConfig.update({
      where: { id: req.params.id },
      data,
    })
    res.json(leaveType)
  } catch {
    res.status(400).json({ error: 'Name already in use or record not found.' })
  }
})

// DELETE /api/leave-types/:id
router.delete('/leave-types/:id', async (req: AuthRequest, res: Response) => {
  await prisma.leaveTypeConfig.delete({ where: { id: req.params.id } })
  res.json({ success: true })
})

export default router
