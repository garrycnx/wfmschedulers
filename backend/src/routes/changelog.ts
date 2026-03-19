import { Router, Response } from 'express'
import { prisma } from '../config/database'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// GET /api/changelog?agentId=xxx&limit=50
router.get('/changelog', async (req: AuthRequest, res: Response) => {
  const orgId   = req.user!.organizationId
  const agentId = req.query.agentId as string | undefined
  const limit   = Math.min(parseInt(req.query.limit as string) || 50, 200)

  const entries = await prisma.changeLog.findMany({
    where: {
      organizationId: orgId ?? undefined,
      ...(agentId ? { agentId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  res.json(entries)
})

export default router
