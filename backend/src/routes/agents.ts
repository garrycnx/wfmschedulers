import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/database'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

const AgentSchema = z.object({
  name:         z.string().min(1),
  email:        z.string().email(),
  phone:        z.string().optional(),
  skill:        z.enum(['junior','mid','senior','lead']),
  team:         z.string().optional(),
  hireDate:     z.string(),
  status:       z.enum(['active','inactive','on_leave']),
  employeeCode: z.string().optional(),
  lobId:        z.string().optional().nullable(),
})

// GET /api/agents
router.get('/', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId
  const agents = await prisma.agent.findMany({
    where: orgId ? { organizationId: orgId } : {},
    orderBy: { createdAt: 'desc' },
  })
  res.json(agents)
})

// GET /api/agents/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const agent = await prisma.agent.findUnique({ where: { id: req.params.id } })
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(agent)
})

// POST /api/agents
router.post('/', async (req: AuthRequest, res: Response) => {
  const data = AgentSchema.parse(req.body)
  const { employeeCode, ...agentFields } = data
  const orgId = req.user!.organizationId ?? 'default'
  const count = await prisma.agent.count({ where: { organizationId: orgId } })
  const agentCode = employeeCode?.trim()
    ? employeeCode.trim().toUpperCase()
    : `AG${String(count + 1).padStart(3, '0')}`

  // Check for duplicate employee ID within this organisation
  const existing = await prisma.agent.findFirst({
    where: { agentCode, organizationId: orgId },
  })
  if (existing) {
    return res.status(409).json({
      error: `Employee ID "${agentCode}" is already assigned to ${existing.name}. Please use a different ID.`,
    })
  }

  const agent = await prisma.agent.create({
    data: {
      ...agentFields,
      hireDate: new Date(data.hireDate),
      agentCode,
      organizationId: orgId,
    },
  })
  res.status(201).json(agent)
})

// PUT /api/agents/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const UpdateSchema = AgentSchema.extend({ hireDate: z.string().optional() })
  const data = UpdateSchema.parse(req.body)
  const { hireDate, employeeCode, ...rest } = data
  const orgId = req.user!.organizationId ?? 'default'

  // If employee ID is being changed, check it's not taken by another agent
  if (employeeCode?.trim()) {
    const newCode = employeeCode.trim().toUpperCase()
    const conflict = await prisma.agent.findFirst({
      where: { agentCode: newCode, organizationId: orgId, NOT: { id: req.params.id } },
    })
    if (conflict) {
      return res.status(409).json({
        error: `Employee ID "${newCode}" is already assigned to ${conflict.name}. Please use a different ID.`,
      })
    }
    // Update including the new agentCode
    const agent = await prisma.agent.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        agentCode: newCode,
        ...(hireDate ? { hireDate: new Date(hireDate) } : {}),
      },
    })
    return res.json(agent)
  }

  const agent = await prisma.agent.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(hireDate ? { hireDate: new Date(hireDate) } : {}),
    },
  })
  res.json(agent)
})

// DELETE /api/agents/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.agent.delete({ where: { id: req.params.id } })
  res.json({ success: true })
})

// POST /api/agents/:id/invite – send portal invite email
router.post('/:id/invite', async (req: AuthRequest, res: Response) => {
  const agent = await prisma.agent.findUnique({ where: { id: req.params.id } })
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  // TODO: integrate SendGrid / Azure Communication Services here
  // For now, just return the portal link
  const portalLink = `${process.env.APP_URL ?? 'http://localhost:3000'}/agent-portal`
  res.json({ success: true, portalLink, message: `Invite would be sent to ${agent.email}` })
})

export default router
