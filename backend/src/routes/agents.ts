import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/database'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { logChange } from '../utils/logChange'

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
    select: {
      id: true, agentCode: true, name: true, email: true, phone: true,
      status: true, skill: true, team: true, hireDate: true,
      lobId: true, organizationId: true, userId: true,
      createdAt: true, updatedAt: true,
    },
  })
  res.json(agents)
})

// GET /api/agents/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const agent = await prisma.agent.findUnique({ where: { id: req.params.id } })
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(agent)
})

// POST /api/agents/bulk – create multiple agents from Excel upload
router.post('/bulk', async (req: AuthRequest, res: Response) => {
  const BulkSchema = z.object({ agents: z.array(AgentSchema) })
  const { agents: rows } = BulkSchema.parse(req.body)
  const orgId = req.user!.organizationId ?? 'default'

  const created: string[] = []
  const failed: { row: number; name: string; error: string }[] = []

  let count = await prisma.agent.count({ where: { organizationId: orgId } })

  for (let i = 0; i < rows.length; i++) {
    const { employeeCode, ...agentFields } = rows[i]
    const agentCode = employeeCode?.trim()
      ? employeeCode.trim().toUpperCase()
      : `AG${String(count + 1).padStart(3, '0')}`
    try {
      const existing = await prisma.agent.findFirst({ where: { agentCode, organizationId: orgId } })
      if (existing) {
        failed.push({ row: i + 2, name: agentFields.name, error: `Employee ID "${agentCode}" already exists` })
        continue
      }
      const dupEmail = await prisma.agent.findFirst({ where: { email: agentFields.email, organizationId: orgId } })
      if (dupEmail) {
        failed.push({ row: i + 2, name: agentFields.name, error: `Email "${agentFields.email}" already exists` })
        continue
      }
      await prisma.agent.create({
        data: { ...agentFields, hireDate: new Date(agentFields.hireDate), agentCode, organizationId: orgId },
      })
      created.push(agentCode)
      count++
    } catch (err: unknown) {
      failed.push({ row: i + 2, name: agentFields.name, error: String(err) })
    }
  }
  res.status(201).json({ created: created.length, failed })
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
  await logChange({
    organizationId:  orgId,
    performedById:   req.user!.id,
    performedByName: req.user!.name,
    agentId:         agent.id,
    entityType:      'agent',
    action:          'created',
    description:     `Agent "${agent.name}" (${agentCode}) was created`,
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
    await logChange({
      organizationId:  orgId,
      performedById:   req.user!.id,
      performedByName: req.user!.name,
      agentId:         agent.id,
      entityType:      'agent',
      action:          'updated',
      description:     `Agent "${agent.name}" was updated`,
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
  await logChange({
    organizationId:  orgId,
    performedById:   req.user!.id,
    performedByName: req.user!.name,
    agentId:         agent.id,
    entityType:      'agent',
    action:          'updated',
    description:     `Agent "${agent.name}" was updated`,
  })
  res.json(agent)
})

// DELETE /api/agents/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const orgId  = req.user!.organizationId ?? 'default'
  const agent  = await prisma.agent.findUnique({ where: { id: req.params.id } })
  await prisma.agent.delete({ where: { id: req.params.id } })
  if (agent) {
    await logChange({
      organizationId:  orgId,
      performedById:   req.user!.id,
      performedByName: req.user!.name,
      agentId:         agent.id,
      entityType:      'agent',
      action:          'deleted',
      description:     `Agent "${agent.name}" was deleted`,
    })
  }
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
