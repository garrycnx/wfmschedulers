import { PrismaClient } from '@prisma/client'

declare global {
  // Prevent multiple instances in development
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

export const prisma = globalThis.__prisma ?? new PrismaClient({
  // Only log errors in all environments — query logging is very slow
  log: ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma
