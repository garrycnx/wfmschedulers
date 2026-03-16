import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import authRouter from './routes/auth'
import agentsRouter from './routes/agents'
import schedulesRouter from './routes/schedules'
import portalRouter from './routes/portal'
import overridesRouter from './routes/overrides'
import { errorHandler } from './middleware/errorHandler'

const app = express()
const PORT = process.env.PORT ?? 5000

// Trust Azure App Service's reverse proxy (fixes express-rate-limit X-Forwarded-For warning)
app.set('trust proxy', 1)

// ─── Security & Middleware ────────────────────────────────────────────────────
app.use(helmet())
app.use(compression())
app.use(morgan('combined'))
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 })
app.use('/api/', limiter)

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRouter)
app.use('/api/agents',    agentsRouter)
app.use('/api/agents',    overridesRouter)   // shift day overrides: /api/agents/:id/overrides
app.use('/api/schedules', schedulesRouter)
app.use('/api/portal',    portalRouter)   // public – no auth required

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`✅  WFM API running on port ${PORT}`)
})

export default app
