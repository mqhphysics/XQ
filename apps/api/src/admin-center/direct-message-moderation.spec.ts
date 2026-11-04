import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { AdminModerationService } from './admin-moderation.service'
import type { AdminCenterService } from './admin-center.service'
import type { AdminMediaService } from './admin-media.service'

test('private review query remains organization-scoped and audit records contain no message body', async () => {
  let query: any, audit: any
  const secret = '只属于会话双方的内容'
  const tx = {
    directMessage: {
      findMany: async (input: any) => {
        query = input
        return [
          {
            id: 'message',
            body: secret,
            senderUserId: 'a',
            sender: { id: 'a', displayName: '甲' },
            conversation: {
              userOne: { id: 'a', displayName: '甲' },
              userTwo: { id: 'b', displayName: '乙' },
            },
            createdAt: new Date(),
            moderationStatus: 'PENDING',
            moderationVersion: 1,
            moderatedAt: null,
          },
        ]
      },
      count: async () => 1,
    },
  }
  const center = {
    read: async (_auth: any, run: any) => run(tx, { organizationId: 'current-org' }),
    auditWrite: async (...args: any[]) => {
      audit = args
    },
  }
  const service = new AdminModerationService(
    center as unknown as AdminCenterService,
    {} as AdminMediaService,
  )
  const response = await service.messages(
    'token',
    { page: 1, pageSize: 20, status: 'PENDING' },
    'request',
  )
  assert.equal(query.where.organizationId, 'current-org')
  assert.equal(query.where.moderationStatus, 'PENDING')
  assert.equal(response.items[0]!.body, secret)
  assert.equal(response.items[0]!.recipient.id, 'b')
  assert(!JSON.stringify(audit).includes(secret))
})

test('a stale private review cannot overwrite another decision or change notifications', async () => {
  let writes = 0
  const tx = {
    directMessage: {
      findFirst: async () => ({
        id: 'message',
        moderationVersion: 2,
        moderationStatus: 'APPROVED',
      }),
      updateMany: async () => ({ count: 0 }),
    },
    userNotification: {
      updateMany: async () => {
        writes++
      },
    },
  }
  const center = {
    write: async (_a: any, _route: any, _body: any, _key: any, run: any) =>
      run(tx, { organizationId: 'org' }),
  }
  const service = new AdminModerationService(
    center as unknown as AdminCenterService,
    {} as AdminMediaService,
  )
  await assert.rejects(
    service.messageDecision(
      'token',
      'message',
      { action: 'HIDE', expectedVersion: 1, reason: '核实违规' },
      'test-key',
      'request',
    ),
    (error: any) => error.getStatus() === 409,
  )
  assert.equal(writes, 0)
})
