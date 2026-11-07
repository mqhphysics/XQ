import assert from 'node:assert/strict'
import test from 'node:test'
import { attachRegisteredStudent } from './student-registration'
import { ApiHttpException } from '../common/api-http.exception'
import type { Prisma } from '../generated/prisma/client'
import { StudentRegistrationService } from './student-registration.service'
import type { CampusCommandService } from './campus-command.service'

function admission(listed: boolean, knownNumber?: string, claimed = false) {
  const updates: unknown[] = [],
    applications: unknown[] = [],
    notifications: unknown[] = [],
    numbers: unknown[] = [],
    audits: unknown[] = []
  const tx = {
    studentRecord: {
      findFirst: async () => null,
      updateMany: async (value: unknown) => {
        numbers.push(value)
        return { count: 1 }
      },
      findMany: async ({ where }: { where: { realName: string; status: string } }) => {
        assert.equal(where.realName, '学生甲')
        assert.equal(where.status, 'ACTIVE')
        return listed
          ? [
              {
                id: 'student',
                studentNumber: knownNumber ?? null,
                user: claimed ? { id: 'another-user' } : null,
              },
            ]
          : []
      },
    },
    identityApplication: {
      create: async (value: unknown) => {
        applications.push(value)
        return { id: 'review' }
      },
    },
    user: { findFirst: async () => null, update: async (value: unknown) => updates.push(value) },
    auditLog: { create: async (value: unknown) => audits.push(value) },
    roleAssignment: { findMany: async () => [{ userId: 'admin' }, { userId: 'admin' }] },
    userNotification: { createMany: async (value: unknown) => notifications.push(value) },
  } as unknown as Prisma.TransactionClient
  return { tx, updates, applications, notifications, numbers, audits }
}
test('an unlisted name is refused without creating an application or linking a record', async () => {
  const f = admission(false)
  await assert.rejects(
    attachRegisteredStudent(f.tx, 'org', 'user', '学生甲', '2026000001'),
    (e) => e instanceof ApiHttpException && e.getStatus() === 403,
  )
  assert.deepEqual(f.updates, [])
  assert.deepEqual(f.applications, [])
})

test('an exact name and number still queues review without granting student or player identity', async () => {
  const f = admission(true, '2026000001')
  assert.equal(await attachRegisteredStudent(f.tx, 'org', 'user', '学生甲', '2026000001'), 'review')
  assert.equal(f.applications.length, 1)
  assert.equal(f.notifications.length, 1)
  const data = (f.updates[0] as { data: Record<string, unknown> }).data
  assert.equal(data.studentRecordId, undefined)
  assert.equal(data.studentId, undefined)
  assert.equal(data.verificationLevel, undefined)
  assert.equal(data.playerProfileId, undefined)
  await assert.rejects(
    attachRegisteredStudent(
      admission(true, '2026000001', true).tx,
      'org',
      'user',
      '学生甲',
      '2026000001',
    ),
  )
})
test('a name-only directory entry stays unchanged until an administrator verifies the proposed number', async () => {
  const f = admission(true)
  assert.equal(await attachRegisteredStudent(f.tx, 'org', 'user', '学生甲', '2026000001'), 'review')
  assert.equal(f.numbers.length, 0)
  assert.equal(f.audits.length, 0)
  assert.equal(f.applications.length, 1)
  assert.equal(f.notifications.length, 1)
  const data = (f.updates[0] as { data: Record<string, unknown> }).data
  assert.equal(data.studentRecordId, undefined)
  assert.equal(data.studentId, undefined)
  assert.equal(data.verificationLevel, undefined)
  assert.equal(data.playerProfileId, undefined)
})

test('open admission permits another person with the same name and a different student number', async () => {
  const previous = process.env.REGISTRATION_AUDIENCE
  process.env.REGISTRATION_AUDIENCE = 'ALL'
  try {
    const f = admission(true, '2026000002', true)
    assert.equal(
      await attachRegisteredStudent(f.tx, 'org', 'user', '学生甲', '2026000001'),
      'review',
    )
    assert.equal(f.applications.length, 1)
    assert.equal(f.numbers.length, 0)
  } finally {
    if (previous === undefined) delete process.env.REGISTRATION_AUDIENCE
    else process.env.REGISTRATION_AUDIENCE = previous
  }
})

test('ambiguous names and malformed numbers retain review; occupied names cannot auto-register', async () => {
  const f = admission(true)
  const record = { id: 'a', studentNumber: null, user: null }
  f.tx.studentRecord.findMany = (async () => [record, { ...record, id: 'b' }]) as never
  assert.equal(await attachRegisteredStudent(f.tx, 'org', 'user', '学生甲', '2026000001'), 'review')
  assert.equal(f.numbers.length, 0)
  const bad = admission(true)
  assert.equal(
    await attachRegisteredStudent(bad.tx, 'org', 'user', '学生甲', '202600001'),
    'review',
  )
  assert.equal(bad.numbers.length, 0)
  await assert.rejects(
    attachRegisteredStudent(
      admission(true, undefined, true).tx,
      'org',
      'user',
      '学生甲',
      '2026000001',
    ),
  )
})

test('self correction resubmits for review without writing a student number or granting verification', async () => {
  const writes: Array<{ data: Record<string, unknown> }> = []
  let notifications = 0
  const tx = {
    identityApplication: {
      findFirst: async () => ({
        id: 'application',
        version: 2,
        status: 'RETURNED',
        user: { realName: '学生甲' },
      }),
      updateMany: async (value: { data: Record<string, unknown> }) => {
        writes.push(value)
        return { count: 1 }
      },
    },
    roleAssignment: { findMany: async () => [{ userId: 'admin' }] },
    userNotification: {
      createMany: async () => {
        notifications++
      },
    },
    studentRecord: {
      updateMany: async () => {
        throw new Error('self correction must not change directory')
      },
    },
    user: {
      findUniqueOrThrow: async () => ({ realName: '学生甲', studentId: null }),
      update: async () => {
        throw new Error('self correction must not grant verification')
      },
    },
  }
  const command = {
    write: async (
      _auth: unknown,
      _route: unknown,
      _body: unknown,
      _key: unknown,
      admin: boolean,
      run: (store: unknown, actor: unknown) => unknown,
    ) => {
      assert.equal(admin, false)
      return run(tx, { organizationId: 'org', userId: 'user' })
    },
    audit: async () => {},
  } as unknown as CampusCommandService
  await new StudentRegistrationService(command).correct(
    'token',
    {
      expectedVersion: 2,
      realName: '学生乙',
      studentNumber: '2026000001',
    },
    'fictional-key',
    'fictional-request',
  )
  assert.equal(writes[0]!.data.status, 'PENDING')
  assert.equal(JSON.parse(String(writes[0]!.data.message)).realName, '学生乙')
  assert.equal(JSON.parse(String(writes[0]!.data.message)).reason, '')
  assert.equal(notifications, 1)
})

function workflow(
  options: { collision?: boolean; self?: boolean; stale?: boolean; ambiguous?: boolean } = {},
) {
  const writes: Array<{ kind: string; value: unknown }> = []
  const application = {
    id: 'review',
    userId: 'user',
    version: 1,
    status: 'PENDING',
    message: JSON.stringify({ studentNumber: '2026000001' }),
    user: {
      id: 'user',
      realName: '学生甲',
      loginNameNormalized: 'xueshengjia123',
      studentId: null,
      status: 'ACTIVE',
      studentRecordId: null,
      verificationLevel: 'UNVERIFIED',
    },
  }
  const tx = {
    identityApplication: {
      findFirst: async () => (options.stale ? null : application),
      update: async () => ({}),
      updateMany: async (value: unknown) => {
        writes.push({ kind: 'application', value })
        return { count: 1 }
      },
    },
    studentRecord: {
      findMany: async () =>
        options.ambiguous ? [{ id: 'student' }, { id: 'other-student' }] : [{ id: 'student' }],
      findFirst: async ({ where }: { where: { id: unknown } }) =>
        typeof where.id === 'string'
          ? {
              id: 'student',
              realName: '学生甲',
              studentNumber: null,
              version: 2,
              user: null,
              player: { id: 'player' },
            }
          : options.collision
            ? { id: 'other' }
            : null,
      update: async (value: unknown) => writes.push({ kind: 'student', value }),
    },
    user: {
      findFirst: async () => null,
      update: async (value: unknown) => writes.push({ kind: 'user', value }),
    },
    playerProfile: { update: async (value: unknown) => writes.push({ kind: 'player', value }) },
    organizationMembership: { count: async () => 2 },
    directConversation: {
      upsert: async () => ({ id: 'conversation' }),
      updateMany: async () => ({ count: 1 }),
    },
    directMessage: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        writes.push({ kind: 'direct', value: { data: create } })
        return { ...create, id: 'message', createdAt: new Date() }
      },
    },
    userNotification: {
      create: async (value: unknown) => writes.push({ kind: 'notification', value }),
      upsert: async (value: unknown) => writes.push({ kind: 'notification', value }),
    },
  }
  const command = {
    write: async (
      _auth: unknown,
      _route: unknown,
      _body: unknown,
      _key: unknown,
      admin: boolean,
      run: (tx: unknown, actor: unknown) => unknown,
    ) => {
      assert.equal(admin, true)
      return run(tx, { organizationId: 'org', userId: options.self ? 'user' : 'admin' })
    },
    requireUserProfileWrite: async () => {},
    audit: async () => {},
  } as unknown as CampusCommandService
  return { service: new StudentRegistrationService(command), writes }
}
test('accepting a number updates only the explicitly selected student and not the user player association', async () => {
  const f = workflow()
  await f.service.review(
    'token',
    'review',
    {
      expectedVersion: 1,
      decision: 'APPROVE',
      studentRecordId: 'student',
      reason: '核对本人提交资料',
    },
    'key-for-test',
    'request',
  )
  assert(f.writes.some((w) => w.kind === 'student'))
  const user = f.writes.find((w) => w.kind === 'user')!.value as {
    data: { studentRecordId: string; studentId: string; playerProfileId?: string }
  }
  assert.equal(user.data.studentRecordId, 'student')
  assert.equal(user.data.studentId, '2026000001')
  assert.equal(user.data.playerProfileId, undefined)
  assert(f.writes.some((w) => w.kind === 'notification'))
})

test('confirming a unique name-only student needs no redundant record picker, but ambiguous names still do', async () => {
  const body = { expectedVersion: 1, decision: 'APPROVE' as const, reason: '核对注册学号' }
  const unique = workflow()
  await unique.service.review('token', 'review', body, 'unique-key', 'request')
  assert(unique.writes.some((w) => w.kind === 'student'))
  const ambiguous = workflow({ ambiguous: true })
  await assert.rejects(
    ambiguous.service.review('token', 'review', body, 'ambiguous-key', 'request'),
  )
  assert(!ambiguous.writes.some((w) => ['user', 'student', 'player'].includes(w.kind)))
})
test('returning incorrect identity data sends an official DM from the reviewing administrator', async () => {
  const f = workflow()
  await f.service.review(
    'token',
    'review',
    { expectedVersion: 1, decision: 'RETURN', reason: '请核对学号后重新提交' },
    'key-for-test',
    'request',
  )
  assert(!f.writes.some((w) => ['student', 'user', 'player'].includes(w.kind)))
  const direct = (
    f.writes.find((w) => w.kind === 'direct')!.value as {
      data: {
        kind: string
        senderUserId: string
        metadata: { deadlineAt: string; actionPath: string }
      }
    }
  ).data
  assert.equal(direct.kind, 'ADMIN_NOTICE')
  assert.equal(direct.senderUserId, 'admin')
  assert.match(direct.metadata.actionPath, /correction=1/)
  assert(
    Math.abs(new Date(direct.metadata.deadlineAt).getTime() - Date.now() - 14 * 86400000) < 5000,
  )
})
test('duplicate numbers, self review and stale versions cannot change student data', async () => {
  for (const option of [{ collision: true }, { self: true }, { stale: true }]) {
    const f = workflow(option)
    await assert.rejects(
      f.service.review(
        'token',
        'review',
        {
          expectedVersion: 1,
          decision: 'APPROVE',
          studentRecordId: 'student',
          reason: '核对本人资料',
        },
        'key-for-test',
        'request',
      ),
      (e) => e instanceof ApiHttpException,
    )
    assert(!f.writes.some((w) => ['user', 'student', 'player'].includes(w.kind)))
  }
})
