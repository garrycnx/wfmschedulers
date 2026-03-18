import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/database'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// ── GET /api/agents/:id/overrides?year=2026&month=3
//                               OR ?from=2026-03-01&to=2026-03-31 ───────────
router.get('/:id/overrides', async (req: AuthRequest, res: Response) => {
  const { year, month, from, to } = req.query
  let fromDate: Date, toDate: Date

  if (from && to) {
    fromDate = new Date((from as string) + 'T00:00:00Z')
    toDate   = new Date((to   as string) + 'T00:00:00Z')
    toDate.setUTCDate(toDate.getUTCDate() + 1) // make end inclusive
  } else {
    const y = parseInt(year as string) || new Date().getFullYear()
    const m = parseInt(month as string) || new Date().getMonth() + 1
    fromDate = new Date(Date.UTC(y, m - 1, 1))
    toDate   = new Date(Date.UTC(y, m, 1))
  }

  const overrides = await prisma.shiftDayOverride.findMany({
    where: {
      agentId: req.params.id,
      overrideDate: { gte: fromDate, lt: toDate },
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
