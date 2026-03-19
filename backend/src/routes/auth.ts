import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import axios from 'axios'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { prisma } from '../config/database'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()

const GoogleLoginSchema = z.object({
  access_token: z.string(),
})

// POST /api/auth/google – exchange Google access_token for our JWT
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { access_token } = GoogleLoginSchema.parse(req.body)

    // Fetch Google profile
    const profileRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const profile = profileRes.data as {
      id: string; email: string; name: string; picture: string
    }

    // Upsert user
    let user = await prisma.user.findUnique({ where: { googleId: profile.id } })
    if (!user) {
      // Auto-create an Organisation for every new sign-up
      const org = await prisma.organization.create({
        data: { name: `${profile.name}'s Workspace` },
      })
      user = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
          googleId: profile.id,
          role: 'manager',
          organizationId: org.id,
        },
      })
    } else {
      // Ensure existing users without an org get one retroactively
      if (!user.organizationId) {
        const org = await prisma.organization.create({
          data: { name: `${user.name}'s Workspace` },
        })
        user = await prisma.user.update({
          where: { id: user.id },
          data: { organizationId: org.id },
        })
      } else {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { name: profile.name, picture: profile.picture },
        })
      }
    }

    // Sign JWT
    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' },
    )

    // Store session
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        organizationId: user.organizationId,
        createdAt: user.createdAt.toISOString(),
      },
      token,
    })
  } catch (err) {
    console.error('/auth/google error', err)
    res.status(401).json({ error: 'Authentication failed' })
  }
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    role: user.role,
    organizationId: user.organizationId,
    createdAt: user.createdAt.toISOString(),
  })
})

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  const token = req.headers.authorization!.slice(7)
  await prisma.session.deleteMany({ where: { token } })
  res.json({ success: true })
})

// POST /api/auth/create-user – manager/admin creates a viewer sub-user
const CreateUserSchema = z.object({
  name:     z.string().min(1),
  username: z.string().min(3).max(50),
  password: z.string().min(6),
})

router.post('/create-user', requireAuth, requireRole('manager', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, username, password } = CreateUserSchema.parse(req.body)
    const orgId = req.user!.organizationId
    if (!orgId) return res.status(400).json({ error: 'No organisation associated with your account' })

    // Check username uniqueness
    const existing = await prisma.user.findUnique({ where: { username } })
    if (existing) return res.status(409).json({ error: 'Username already taken' })

    const passwordHash = await bcrypt.hash(password, 10)

    // Sub-users need a unique dummy email to satisfy the @unique constraint
    const email = `viewer-${username}@internal.wfmclub`

    const user = await prisma.user.create({
      data: {
        email,
        name,
        username,
        passwordHash,
        role: 'viewer',
        organizationId: orgId,
      },
    })

    res.status(201).json({
      id:             user.id,
      name:           user.name,
      username:       user.username,
      role:           user.role,
      organizationId: user.organizationId,
      createdAt:      user.createdAt.toISOString(),
    })
  } catch (err) {
    console.error('/auth/create-user error', err)
    res.status(400).json({ error: 'Failed to create user' })
  }
})

// POST /api/auth/user-login – username+password login for viewer sub-users
const UserLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

router.post('/user-login', async (req: Request, res: Response) => {
  try {
    const { username, password } = UserLoginSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' })

    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' },
    )

    await prisma.session.create({
      data: {
        userId:    user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })

    res.json({
      user: {
        id:             user.id,
        email:          user.email,
        name:           user.name,
        picture:        user.picture,
        role:           user.role,
        organizationId: user.organizationId,
        createdAt:      user.createdAt.toISOString(),
      },
      token,
    })
  } catch (err) {
    console.error('/auth/user-login error', err)
    res.status(401).json({ error: 'Authentication failed' })
  }
})

// GET /api/auth/sub-users – list viewer sub-users in same org
router.get('/sub-users', requireAuth, async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId
  const users = await prisma.user.findMany({
    where: {
      organizationId: orgId ?? undefined,
      role: 'viewer',
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, username: true, role: true,
      organizationId: true, createdAt: true,
    },
  })
  res.json(users)
})

// DELETE /api/auth/sub-users/:id – delete a viewer user
router.delete('/sub-users/:id', requireAuth, requireRole('manager', 'admin'), async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId
  const user = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (user.organizationId !== orgId) return res.status(403).json({ error: 'Forbidden' })
  if (user.role !== 'viewer') return res.status(400).json({ error: 'Can only delete viewer accounts' })

  // Delete sessions first
  await prisma.session.deleteMany({ where: { userId: user.id } })
  await prisma.user.delete({ where: { id: req.params.id } })
  res.json({ success: true })
})

export default router
