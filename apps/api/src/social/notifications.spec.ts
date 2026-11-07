import type { Prisma } from '../generated/prisma/client'
import test from 'node:test'
import assert from 'node:assert/strict'
import { SocialService } from './social.service'
import type { PrismaService } from '../database/prisma.service'
import type { AuthService } from '../auth/auth.service'

test('notification pagination is scoped and stable for tied timestamps, with full unread count', async () => {
  const createdAt = new Date('2026-11-01T00:00:00Z')
  const rows = Array.from({ length: 101 }, (_, i) => ({
    id: 'n' + i,
    type: 'SYSTEM',
    title: 'TEST',
    createdAt,
    body: null,
    readAt: null,
    linkPath: null,
    actor: null,
  }))
  let query: Prisma.UserNotificationFindManyArgs | undefined
  const prisma = {
    userBlock: { findMany: async () => [] },
    userNotification: {
      findFirst: async ({ where }: { where: Prisma.UserNotificationWhereInput }) => {
        assert.equal(where.recipientUserId, 'user')
        assert.equal(where.organizationId, 'org')
        return { id: 'anchor', createdAt }
      },
      findMany: async (args: Prisma.UserNotificationFindManyArgs) => {
        query = args
        return rows
      },
      count: async () => 150,
    },
  } as unknown as PrismaService
  const service = new SocialService(prisma, {
    requireSession: async () => ({ organizationId: 'org', userId: 'user' }),
  } as unknown as AuthService)
  const page = await service.listNotifications('token', 'anchor')
  assert.equal(page.items.length, 100)
  assert.equal(page.nextCursor, 'n99')
  assert.equal(page.unreadCount, 150)
  assert.deepEqual(query!.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }])
  assert.deepEqual(query!.where!.OR, [
    { createdAt: { lt: createdAt } },
    { createdAt, id: { lt: 'anchor' } },
  ])
})

test('old notification details do not depend on the latest page and foreign IDs are not readable', async () => {
  const store = {
    userBlock: { findMany: async () => [] },
    userNotification: {
      findMany: async ({ where }: { where: Prisma.UserNotificationWhereInput }) => {
        assert.equal(where.organizationId, 'org')
        assert.equal(where.recipientUserId, 'user')
        return where.id === 'old-owned'
          ? [{ id: 'old-owned', createdAt: new Date(), actor: null }]
          : []
      },
      count: async () => 0,
    },
  } as unknown as PrismaService
  const service = new SocialService(store, {
    requireSession: async () => ({ organizationId: 'org', userId: 'user' }),
  } as unknown as AuthService)
  assert.equal((await service.getNotification('token', 'old-owned')).id, 'old-owned')
  await assert.rejects(service.getNotification('token', 'foreign'), /通知不存在/)
})
