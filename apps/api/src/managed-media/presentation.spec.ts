import assert from 'node:assert/strict'
import test from 'node:test'
import type { PrismaService } from '../database/prisma.service'
import type { AuthService } from '../auth/auth.service'
import type { ResultsService } from '../results/results.service'
import { ManagedMediaService } from './managed-media.service'

test('profile background follows the current user field instead of an older approved upload', async () => {
  const userId = '10000000-0000-4000-8000-000000000001'
  const db = {
    roleAssignment: { findMany: async () => [] },
    organizationMembership: {
      findFirst: async () => ({
        id: 'member',
        user: { coverUrl: '/api/media/avatars/current-background.webp' },
      }),
    },
    $queryRaw: async () => {
      throw Error('Historical uploads must not replace the current selected cover')
    },
  } as unknown as PrismaService
  const auth = {
    requireSession: async () => ({ organizationId: 'org', userId, user: { roles: [] } }),
  } as unknown as AuthService
  const service = new ManagedMediaService(db, auth, {} as ResultsService)
  assert.equal(
    (await service.presentation('Bearer test', userId)).backgroundUrl,
    '/api/media/avatars/current-background.webp',
  )
})
