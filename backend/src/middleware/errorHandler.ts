import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err)

  // Zod validation errors → 400 with a readable message
  if (err instanceof ZodError) {
    const msg = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
    return res.status(400).json({ error: `Validation error: ${msg}` })
  }

  res.status(500).json({ error: 'Internal server error', message: err.message })
}
