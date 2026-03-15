import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import axios from 'axios'
import { z } from 'zod'
import { prisma } from '../config/database'
import { requireAuth, AuthRequest } from '../middleware/auth'

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
      { sub: user.id, email: user.email, role: user.role, organizationId: user.organizationId },
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

export default router
