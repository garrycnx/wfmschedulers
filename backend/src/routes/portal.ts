import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/database'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()

// POST /api/portal/login – agent login (public, no auth required)
// Body: { agentCode, password? }
// If the agent has a linked User with a passwordHash, password is required and verified.
// If no linked User / no passwordHash, access is granted by agentCode alone (legacy / no-password agents).
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { agentCode, password } = req.body as { agentCode?: string; password?: string }
    if (!agentCode?.trim()) {
      return res.status(400).json({ error: 'Employee ID is required.' })
    }
    const agent = await prisma.agent.findFirst({
      where: { agentCode: { equals: agentCode.trim().toUpperCase(), mode: 'insensitive' } },
      include: { user: true },  // include linked User to get passwordHash
    })
    if (!agent) {
      return res.status(404).json({ error: 'Employee ID not found. Please check and try again.' })
    }
    if (agent.status === 'inactive') {
      return res.status(403).json({ error: 'Your account is inactive. Contact your manager.' })
    }

    // If the agent has a linked User with a password, verify it
    if (agent.user?.passwordHash) {
      if (!password) {
        return res.status(401).json({ error: 'Password is required for your account.' })
      }
      const valid = await bcrypt.compare(password, agent.user.passwordHash)
      if (!valid) {
        return res.status(401).json({ error: 'Incorrect password. Please try again.' })
      }
    }

    return res.json({
      success: true,
      hasPassword: !!agent.user?.passwordHash,
      agent: { id: agent.id, name: agent.name, agentCode: agent.agentCode },
    })
  } catch (err) {
    console.error('/portal/login error', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

// POST /api/portal/set-password – manager sets/resets an agent's portal password
// Body: { agentId, password }
router.post('/set-password', requireAuth, requireRole('manager', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { agentId, password } = req.body as { agentId?: string; password?: string }
    if (!agentId || !password || password.length < 6) {
      return res.status(400).json({ error: 'agentId and a password of at least 6 characters are required.' })
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { user: true },
    })
    if (!agent) return res.status(404).json({ error: 'Agent not found.' })
    if (agent.organizationId !== req.user!.organizationId) {
      return res.status(403).json({ error: 'Forbidden.' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    if (agent.userId && agent.user) {
      // Update existing linked User
      await prisma.user.update({
        where: { id: agent.userId },
        data: { passwordHash },
      })
    } else {
      // Create a new User record for this agent and link it
      const portalEmail = `agent-portal-${agent.agentCode.toLowerCase()}@internal.wfmclub`
      // Check if a user with this email already exists (e.g. from a previous attempt)
      let linkedUser = await prisma.user.findUnique({ where: { email: portalEmail } })
      if (!linkedUser) {
        linkedUser = await prisma.user.create({
          data: {
            email: portalEmail,
            name: agent.name,
            role: 'agent',
            passwordHash,
            organizationId: agent.organizationId,
          },
        })
      } else {
        await prisma.user.update({ where: { id: linkedUser.id }, data: { passwordHash } })
      }
      await prisma.agent.update({ where: { id: agentId }, data: { userId: linkedUser.id } })
    }

    return res.json({ success: true })
  } catch (err) {
    console.error('/portal/set-password error', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

// GET /api/portal/schedule/:agentCode – released schedule for an agent (public)
router.get('/schedule/:agentCode', async (req: Request, res: Response) => {
  try {
    const agent = await prisma.agent.findFirst({
      where: { agentCode: { equals: req.params.agentCode.trim().toUpperCase(), mode: 'insensitive' } },
    })
    if (!agent) return res.status(404).json({ error: 'Agent not found.' })

    // Latest published schedule for this org
    const schedule = await prisma.schedule.findFirst({
      where: { organizationId: agent.organizationId, status: 'published' },
      orderBy: { updatedAt: 'desc' },
    })
    if (!schedule) return res.json({ released: false })

    // Parse agentsJson to find this agent's slot ID (agentId merged in at save time)
    const scheduledAgents = JSON.parse(schedule.agentsJson) as Array<{
      id: string; agentId?: string; start: number; end: number; off: string[]
    }>
    const slot = scheduledAgents.find(a => a.agentId === agent.id)

    // Parse release range from settingsJson (saved as releaseFrom / releaseTo)
    const settings = JSON.parse(schedule.settingsJson) as { releaseFrom?: string; releaseTo?: string }
    const weekStart = schedule.weekStartDate.toISOString().split('T')[0]
    const releaseRange = {
      from: settings.releaseFrom ?? weekStart,
      to:   settings.releaseTo  ?? weekStart,
    }

    const rosterRows = JSON.parse(schedule.rosterJson) as Array<Record<string, string>>
    const breakRows  = JSON.parse(schedule.breaksJson)  as Array<Record<string, string>>

    const myRosterRow = slot
      ? (rosterRows.find(r => r.agent === slot.id) ?? rosterRows[0] ?? null)
      : (rosterRows[0] ?? null)
    const myBreakRow = slot
      ? (breakRows.find(r => r.agent === slot.id) ?? breakRows[0] ?? null)
      : (breakRows[0] ?? null)

    // Fetch shift day overrides for this agent within the release range
    const fromDate = new Date(releaseRange.from + 'T00:00:00Z')
    const toDate   = new Date(releaseRange.to   + 'T00:00:00Z')
    toDate.setUTCDate(toDate.getUTCDate() + 1) // inclusive end

    const overrides = await prisma.shiftDayOverride.findMany({
      where: {
        agentId:      agent.id,
        overrideDate: { gte: fromDate, lt: toDate },
      },
    })

    // Convert to a date-keyed map for easy frontend lookup
    const overrideMap: Record<string, { isOff: boolean; shiftStart: string | null; shiftEnd: string | null }> = {}
    for (const ov of overrides) {
      const key = ov.overrideDate.toISOString().split('T')[0] // 'YYYY-MM-DD'
      overrideMap[key] = { isOff: ov.isOff, shiftStart: ov.shiftStart, shiftEnd: ov.shiftEnd }
    }

    return res.json({
      released: true,
      releaseRange,
      rosterRow:   myRosterRow,
      breakRow:    myBreakRow,
      overrideMap,
    })
  } catch {
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

// ─── Portal Leave endpoints (public – agent authenticated by agentId in body) ─

// GET /api/portal/leave/balances/:agentId
router.get('/leave/balances/:agentId', async (req: Request, res: Response) => {
  try {
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear()
    const balances = await prisma.leaveBalance.findMany({
      where: { agentId: req.params.agentId, year },
    })
    res.json(balances)
  } catch {
    res.status(500).json({ error: 'Internal server error.' })
  }
})

// GET /api/portal/leave/requests/:agentId
router.get('/leave/requests/:agentId', async (req: Request, res: Response) => {
  try {
    const requests = await prisma.leaveRequest.findMany({
      where: { agentId: req.params.agentId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(requests)
  } catch {
    res.status(500).json({ error: 'Internal server error.' })
  }
})

// POST /api/portal/leave/requests – agent submits leave
router.post('/leave/requests', async (req: Request, res: Response) => {
  try {
    const { agentId, leaveType, startDate, endDate, durationType, totalHours, notes } = req.body as {
      agentId: string; leaveType: string; startDate: string; endDate: string
      durationType: string; totalHours: number; notes?: string
    }
    if (!agentId || !leaveType || !startDate || !endDate || !durationType || !totalHours) {
      return res.status(400).json({ error: 'Missing required fields.' })
    }

    // Verify agent exists
    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) return res.status(404).json({ error: 'Agent not found.' })

    // Validate balance
    const year    = new Date(startDate).getFullYear()
    const balance = await prisma.leaveBalance.findUnique({
      where: { agentId_leaveType_year: { agentId, leaveType, year } },
    })
    if (balance) {
      const remaining = balance.totalHours - balance.usedHours
      if (totalHours > remaining) {
        return res.status(400).json({
          error: `Insufficient ${leaveType} leave. Available: ${remaining}h, Requested: ${totalHours}h`,
        })
      }
    }

    // Check max per day
    const quota = await prisma.leaveQuota.findFirst({
      where: { organizationId: agent.organizationId, leaveType },
      orderBy: { createdAt: 'desc' },
    })
    if (quota) {
      const overlapping = await prisma.leaveRequest.count({
        where: {
          organizationId: agent.organizationId,
          leaveType,
          status: 'approved',
          startDate: { lte: new Date(endDate) },
          endDate:   { gte: new Date(startDate) },
        },
      })
      if (overlapping >= quota.maxPerDay) {
        return res.status(400).json({
          error: `Maximum ${quota.maxPerDay} agents can take ${leaveType} leave on overlapping days.`,
        })
      }
    }

    const request = await prisma.leaveRequest.create({
      data: {
        agentId,
        leaveType,
        startDate:      new Date(startDate),
        endDate:        new Date(endDate),
        durationType,
        totalHours,
        notes:          notes ?? null,
        organizationId: agent.organizationId,
      },
    })
    res.status(201).json(request)
  } catch {
    res.status(500).json({ error: 'Internal server error.' })
  }
})

export default router
