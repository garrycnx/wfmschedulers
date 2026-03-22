import { PrismaClient } from '@prisma/client'

declare global {
  // Prevent multiple instances in development
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

export const prisma = globalThis.__prisma ?? new PrismaClient({
  // Only log errors — query logging is very slow
  log: ['error'],
})

if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma
