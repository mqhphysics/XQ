import assert from 'node:assert/strict'
import test from 'node:test'

import { HttpStatus } from '@nestjs/common'

import { ApiHttpException } from '../common/api-http.exception'
import { DEMO_ACCOUNTS, DEMO_ORGANIZATION_ID, fixtureId } from '../database/demo-fixture'
import type { PrismaService } from '../database/prisma.service'
import { Prisma } from '../generated/prisma/client'
import { AuthService } from './auth.service'
import { hashPassword } from './password'

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000091'
const PASSWORD = 'Fictional-test-2026!'
const digest = hashPassword(PASSWORD)

function user(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: 'ACTIVE',
    loginNameNormalized: `fictional-${id}`,
    displayName: '虚构同名账号',
    realName: '虚构姓名',
    realNameNormalized: '虚构姓名',
    studentId: null,
    email: null,
    emailNormalized: null,
    bio: null,
    avatarUrl: null,
    verificationLevel: 'UNVERIFIED',
    playerProfile: null,
    roleAssignments: [],
    memberships: [{ organizationId: ORGANIZATION_ID, status: 'ACTIVE' }],
    passwordCredential: { passwordHash: digest.hash, passwordSalt: digest.salt },
    ...overrides,
  }
}

function httpStatus(status: number) {
  return (error: unknown) => error instanceof ApiHttpException && error.getStatus() === status
}

function loginService(users: ReturnType<typeof user>[]) {
  const created: unknown[] = []
  const prisma = {
    organization: { findFirst: async () => ({ id: ORGANIZATION_ID }) },
    user: {
      findMany: async ({
        where,
        take,
      }: {
        where: { OR: Array<Record<string, unknown>> }
        take: number
      }) =>
        users
          .filter((candidate) =>
            where.OR.some((condition) =>
              Object.entries(condition).every(([key, value]) => {
                const actual = (candidate as Record<string, unknown>)[key]
                return typeof value === 'object' && value !== null && 'equals' in value
                  ? String(actual).toLowerCase() === String(value.equals).toLowerCase()
                  : actual === value
              }),
            ),
          )
          .slice(0, take),
    },
    userSession: {
      create: async ({ data }: { data: unknown }) => {
        created.push(data)
      },
    },
  }
  return { service: new AuthService(prisma as unknown as PrismaService), created }
}

test("a unique username cannot be shadowed by someone else's nickname", async () => {
  const otherDigest = hashPassword('Other-fictional-password!')
  const owner = user('owner', { loginNameNormalized: 'owner-login' })
  const alias = user('alias', {
    displayName: 'owner-login',
    passwordCredential: { passwordHash: otherDigest.hash, passwordSalt: otherDigest.salt },
  })
  const { service, created } = loginService([alias, owner])
  assert.equal((await service.login('owner-login', PASSWORD, ORGANIZATION_ID, {})).user.id, 'owner')
  await assert.rejects(
    service.login('owner-login', 'Other-fictional-password!', ORGANIZATION_ID, {}),
    httpStatus(401),
  )
  assert.equal(created.length, 1)
})

test('unique identifiers are not truncated by more than ten matching nicknames', async () => {
  const aliases = Array.from({ length: 11 }, (_, i) =>
    user(`alias-${i}`, { displayName: 'owner-login' }),
  )
  const { service } = loginService([
    ...aliases,
    user('owner', { loginNameNormalized: 'owner-login' }),
  ])
  assert.equal((await service.login('owner-login', PASSWORD, ORGANIZATION_ID, {})).user.id, 'owner')
})

test('a username/student-ID collision is resolved only by a unique password match', async () => {
  const otherDigest = hashPassword('Other-fictional-password!')
  const usernameOwner = user('username', { loginNameNormalized: '2099990001' })
  const studentOwner = user('student', {
    studentId: '2099990001',
    passwordCredential: { passwordHash: otherDigest.hash, passwordSalt: otherDigest.salt },
  })
  const { service } = loginService([usernameOwner, studentOwner])
  assert.equal(
    (await service.login('2099990001', 'Other-fictional-password!', ORGANIZATION_ID, {})).user.id,
    'student',
  )
  const ambiguous = loginService([usernameOwner, user('student', { studentId: '2099990001' })])
  await assert.rejects(
    ambiguous.service.login('2099990001', PASSWORD, ORGANIZATION_ID, {}),
    httpStatus(401),
  )
  assert.equal(ambiguous.created.length, 0)
})

test('a same-name group of eleven fails closed instead of authenticating a truncated subset', async () => {
  const different = hashPassword('Other-fictional-password!')
  const { service, created } = loginService(
    Array.from({ length: 11 }, (_, i) =>
      user(`alias-${i}`, {
        passwordCredential:
          i === 0 || i === 10
            ? { passwordHash: digest.hash, passwordSalt: digest.salt }
            : { passwordHash: different.hash, passwordSalt: different.salt },
      }),
    ),
  )
  await assert.rejects(
    service.login('虚构同名账号', PASSWORD, ORGANIZATION_ID, {}),
    httpStatus(401),
  )
  assert.equal(created.length, 0)
})

test('small same-name groups require exactly one matching password', async () => {
  const otherDigest = hashPassword('Other-fictional-password!')
  const { service } = loginService([
    user('first'),
    user('second', {
      passwordCredential: { passwordHash: otherDigest.hash, passwordSalt: otherDigest.salt },
    }),
  ])
  assert.equal((await service.login('虚构姓名', PASSWORD, ORGANIZATION_ID, {})).user.id, 'first')
  const ambiguous = loginService([user('first'), user('second')])
  await assert.rejects(
    ambiguous.service.login('虚构姓名', PASSWORD, ORGANIZATION_ID, {}),
    httpStatus(401),
  )
})

function sessionService() {
  const current = {
    id: 'session-fictional',
    organizationId: ORGANIZATION_ID,
    revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 60_000),
    lastSeenAt: new Date(),
    organization: { status: 'ACTIVE' },
    user: user('session-user'),
  }
  let writes = 0
  const prisma = {
    userSession: {
      findUnique: async () => current,
      update: async () => {
        writes++
      },
    },
  }
  return {
    current,
    service: new AuthService(prisma as unknown as PrismaService),
    writes: () => writes,
  }
}

test('revoked, expired, disabled-user, disabled-organization and removed-member sessions are rejected', async (t) => {
  for (const condition of ['revoked', 'expired', 'user', 'organization', 'membership']) {
    await t.test(condition, async () => {
      const { current, service, writes } = sessionService()
      if (condition === 'revoked') current.revokedAt = new Date()
      if (condition === 'expired') current.expiresAt = new Date(Date.now() - 1)
      if (condition === 'user') current.user.status = 'FROZEN'
      if (condition === 'organization') current.organization.status = 'SUSPENDED'
      if (condition === 'membership') current.user.memberships[0]!.status = 'LEFT'
      assert.equal(await service.getSession('Bearer token'), null)
      assert.equal(writes(), 0)
    })
  }
})

test('identity reads use current scoped roles, accept case-insensitive Bearer and throttle last-seen writes', async () => {
  const { current, service, writes } = sessionService()
  Object.assign(current.user, {
    roleAssignments: [
      { organizationId: ORGANIZATION_ID, role: 'TEAM_CAPTAIN', scopeType: 'TEAM', scopeId: 'team' },
      {
        organizationId: 'other',
        role: 'ORGANIZATION_ADMIN',
        scopeType: 'ORGANIZATION',
        scopeId: 'other',
      },
      { organizationId: null, role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM', scopeId: 'global' },
    ],
  })
  assert.deepEqual(
    (await service.getSession('bearer token'))?.user.roles.map((r) => r.role),
    ['TEAM_CAPTAIN', 'PLATFORM_ADMIN'],
  )
  assert.equal(writes(), 0)
  current.lastSeenAt = new Date(Date.now() - 61_000)
  await service.getSession('Bearer token')
  assert.equal(writes(), 1)
  Object.assign(current.user, { roleAssignments: [] })
  assert.deepEqual((await service.getSession('Bearer token'))?.user.roles, [])
})

test('registration and profile unique-write races return 409 while other database failures remain errors', async () => {
  const collision = new Prisma.PrismaClientKnownRequestError('fictional unique conflict', {
    code: 'P2002',
    clientVersion: 'test',
  })
  const prisma = {
    organization: { findFirst: async () => ({ id: ORGANIZATION_ID }) },
    user: { findFirst: async () => null },
    $transaction: async () => {
      throw collision
    },
  }
  const service = new AuthService(prisma as unknown as PrismaService)
  const register = {
    username: 'fictional-user',
    displayName: '虚构用户',
    realName: '虚构姓名',
    studentId: '2099990001',
    email: 'fictional@example.invalid',
    password: PASSWORD,
  }
  await assert.rejects(
    service.register(register, ORGANIZATION_ID, { requestId: 'test' }),
    httpStatus(409),
  )
  service.requireSession = async () => ({
    sessionId: 'test',
    userId: 'test',
    organizationId: ORGANIZATION_ID,
    user: {
      id: 'test',
      organizationId: ORGANIZATION_ID,
      username: 'test',
      displayName: '虚构用户',
      realName: null,
      studentId: null,
      email: null,
      bio: null,
      avatarUrl: null,
      verificationLevel: 'UNVERIFIED',
      roles: [],
      linkedPlayer: null,
    },
  })
  await assert.rejects(
    service.updateProfile(
      'Bearer token',
      { displayName: '虚构用户', email: 'fictional@example.invalid' },
      { requestId: 'test' },
    ),
    httpStatus(409),
  )
  prisma.$transaction = async () => {
    throw new Error('database unavailable')
  }
  await assert.rejects(
    service.register(register, ORGANIZATION_ID, { requestId: 'test' }),
    /database unavailable/,
  )
})

test('weak identity recovery is opt-in, production-disabled and restricted to known demo accounts', async () => {
  const originalEnvironment = process.env.NODE_ENV
  const originalFlag = process.env.ENABLE_DEMO_IDENTITY_RECOVERY
  const demoAccount = DEMO_ACCOUNTS[0]!
  let queried = 0
  let reset = 0
  const prisma = {
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        queried++
        assert.equal(where.id.in.includes(fixtureId(`user:${demoAccount.username}`)), true)
        return []
      },
    },
    $transaction: async () => {
      reset++
    },
  }
  const service = new AuthService(prisma as unknown as PrismaService)
  const body = { realName: '虚构姓名', studentId: '2099990001', newPassword: PASSWORD }
  try {
    process.env.NODE_ENV = 'development'
    delete process.env.ENABLE_DEMO_IDENTITY_RECOVERY
    await assert.rejects(
      service.resetPasswordByIdentity(body, { requestId: 'test' }),
      httpStatus(HttpStatus.FORBIDDEN),
    )
    assert.equal(queried, 0)
    process.env.ENABLE_DEMO_IDENTITY_RECOVERY = 'true'
    process.env.NODE_ENV = 'production'
    await assert.rejects(
      service.resetPasswordByIdentity(body, { requestId: 'test' }),
      httpStatus(403),
    )
    process.env.NODE_ENV = 'development'
    await assert.rejects(
      service.resetPasswordByIdentity(body, { requestId: 'test' }),
      httpStatus(401),
    )
    assert.equal(reset, 0)
    assert.notEqual(DEMO_ORGANIZATION_ID, ORGANIZATION_ID)
  } finally {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalEnvironment
    if (originalFlag === undefined) delete process.env.ENABLE_DEMO_IDENTITY_RECOVERY
    else process.env.ENABLE_DEMO_IDENTITY_RECOVERY = originalFlag
  }
})

test('enabled demo recovery updates its password, revokes its sessions and records an audit', async () => {
  const originalEnvironment = process.env.NODE_ENV
  const originalFlag = process.env.ENABLE_DEMO_IDENTITY_RECOVERY
  const account = DEMO_ACCOUNTS[0]!
  const id = fixtureId(`user:${account.username}`)
  const effects: Array<{ kind: string; data: Record<string, unknown> }> = []
  const prisma = {
    user: {
      findMany: async ({ include }: { include: { memberships: { where: unknown } } }) => {
        assert.deepEqual(include.memberships.where, {
          organizationId: DEMO_ORGANIZATION_ID,
          status: 'ACTIVE',
          organization: { status: 'ACTIVE' },
        })
        return [{ id, memberships: [{ organizationId: DEMO_ORGANIZATION_ID }] }]
      },
    },
    passwordCredential: {
      upsert: async (data: Record<string, unknown>) => {
        effects.push({ kind: 'password', data })
      },
    },
    userSession: {
      updateMany: async (data: Record<string, unknown>) => {
        effects.push({ kind: 'sessions', data })
      },
    },
    auditLog: {
      create: async (data: Record<string, unknown>) => {
        effects.push({ kind: 'audit', data })
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  }
  try {
    process.env.NODE_ENV = 'development'
    process.env.ENABLE_DEMO_IDENTITY_RECOVERY = 'true'
    await new AuthService(prisma as unknown as PrismaService).resetPasswordByIdentity(
      { realName: account.realName, studentId: account.studentId, newPassword: PASSWORD },
      { requestId: 'fictional-recovery' },
    )
    assert.deepEqual(
      effects.map((e) => e.kind),
      ['password', 'sessions', 'audit'],
    )
    assert.deepEqual(effects[1]!.data.where, { userId: id, revokedAt: null })
    assert.equal(
      (effects[2]!.data.data as Record<string, unknown>).organizationId,
      DEMO_ORGANIZATION_ID,
    )
  } finally {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalEnvironment
    if (originalFlag === undefined) delete process.env.ENABLE_DEMO_IDENTITY_RECOVERY
    else process.env.ENABLE_DEMO_IDENTITY_RECOVERY = originalFlag
  }
})
