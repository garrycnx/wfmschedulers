import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/database'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// ── GET /api/agents/:id/overrides?year=2026&month=3 ──────────────────────────
router.get('/:id/overrides', async (req: AuthRequest, res: Response) => {
  const { year, month } = req.query
  const y = parseInt(year as string) || new Date().getFullYear()
  const m = parseInt(month as string) || new Date().getMonth() + 1

  const from = new Date(Date.UTC(y, m - 1, 1))
  const to   = new Date(Date.UTC(y, m, 1)) // first day of next month

  const overrides = await prisma.shiftDayOverride.findMany({
    where: {
      agentId: req.params.id,
      overrideDate: { gte: from, lt: to },
    },
    orderBy: { overrideDate: 'asc' },
  })
  res.json(overrides)
})

// ── POST /api/agents/:id/overrides ────────────────────────────────────────────
// Creates or updates the override for a specific date (upsert)
const OverrideSchema = z.object({
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  isOff:      z.boolean().default(false),
  shiftStart: z.string().optional().nullable(),
  shiftEnd:   z.string().optional().nullable(),
  note:       z.string().optional().nullable(),
})

router.post('/:id/overrides', async (req: AuthRequest, res: Response) => {
  const data = OverrideSchema.parse(req.body)
  const orgId = req.user!.organizationId ?? 'default'

  // Parse the date as UTC midnight
  const [y, mo, d] = data.date.split('-').map(Number)
  const overrideDate = new Date(Date.UTC(y, mo - 1, d))

  const override = await prisma.shiftDayOverride.upsert({
    where: { agentId_overrideDate: { agentId: req.params.id, overrideDate } },
    update: {
      isOff:      data.isOff,
      shiftStart: data.isOff ? null : (data.shiftStart ?? null),
      shiftEnd:   data.isOff ? null : (data.shiftEnd ?? null),
      note:       data.note ?? null,
    },
    create: {
      agentId:      req.params.id,
      overrideDate,
      isOff:        data.isOff,
      shiftStart:   data.isOff ? null : (data.shiftStart ?? null),
      shiftEnd:     data.isOff ? null : (data.shiftEnd ?? null),
      note:         data.note ?? null,
      organizationId: orgId,
    },
  })
  res.status(201).json(override)
})

// ── DELETE /api/agents/:id/overrides/:date ────────────────────────────────────
// Clears the override for a specific date (reverts to regular shift)
router.delete('/:id/overrides/:date', async (req: AuthRequest, res: Response) => {
  const [y, mo, d] = req.params.date.split('-').map(Number)
  const overrideDate = new Date(Date.UTC(y, mo - 1, d))

  await prisma.shiftDayOverride.deleteMany({
    where: { agentId: req.params.id, overrideDate },
  })
  res.json({ success: true })
})

export default router
