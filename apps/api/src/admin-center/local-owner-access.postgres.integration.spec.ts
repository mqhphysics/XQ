import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { AuthService } from '../auth/auth.service'
import { PrismaService } from '../database/prisma.service'
import { LocalOwnerAccessService } from './local-owner-access.service'
import type { LocalOwnerOptions, LocalOwnerRequest } from './local-owner-access.service'

test('local owner entry creates ordinary audited sessions and rejects remote or unauthorized entry', async (t) => {
  const database = process.env.TEST_DATABASE_URL
  assert.ok(database, 'A disposable PostgreSQL TEST_DATABASE_URL is required')
  assert.match(new URL(database).pathname, /test|ci/)
  assert.notEqual(database, process.env.DATABASE_URL, 'Never operate the daily database')
  const prisma = new PrismaService({ datasources: { db: { url: database } } })
  const suffix = randomUUID().slice(0, 8)
  const originalMode = process.env.NODE_ENV
  let organizationId = ''
  let ownerId = ''
  let studentId = ''
  try {
    process.env.NODE_ENV = 'development'
    const organization = await prisma.organization.create({
      data: { slug: `local-owner-test-${suffix}`, name: 'FICTIONAL_TEST Local Owner' },
    })
    organizationId = organization.id
    const owner = await prisma.user.create({
      data: {
        loginNameNormalized: `local-owner-${suffix}`,
        displayName: 'FICTIONAL_TEST Owner',
        memberships: { create: { organizationId, status: 'ACTIVE' } },
      },
    })
    ownerId = owner.id
    const student = await prisma.user.create({
      data: {
        loginNameNormalized: `local-student-${suffix}`,
        displayName: 'FICTIONAL_TEST Ordinary User',
        memberships: { create: { organizationId, status: 'ACTIVE' } },
      },
    })
    studentId = student.id
    await prisma.roleAssignment.create({
      data: {
        organizationId,
        userId: ownerId,
        role: 'ORGANIZATION_ADMIN',
        scopeType: 'ORGANIZATION',
        scopeId: organizationId,
      },
    })
    const access = new LocalOwnerAccessService(prisma)
    const auth = new AuthService(prisma)
    const options: LocalOwnerOptions = {
      enabled: true,
      development: true,
      organizationId,
      ownerLoginName: `local-owner-${suffix}`,
      origin: 'http://127.0.0.1:5173',
    }
    const local: LocalOwnerRequest = {
      address: '127.0.0.1',
      host: '127.0.0.1:5173',
      origin: options.origin,
      fetchSite: 'same-origin',
    }
    const denied = async (settings: LocalOwnerOptions, request: LocalOwnerRequest) => {
      await assert.rejects(access.enter(settings, request), (error: unknown) =>
        Boolean(
          error &&
          typeof error === 'object' &&
          'getStatus' in error &&
          (error as { getStatus: () => number }).getStatus() === 403,
        ),
      )
    }
    await t.test('off switch and production disable passwordless entry', async () => {
      await denied({ ...options, enabled: false }, local)
      await denied({ ...options, development: false }, local)
      process.env.NODE_ENV = 'production'
      await denied(options, local)
      process.env.NODE_ENV = 'development'
    })
    await t.test(
      'remote address, rebinding host, absent/wrong origin and cross-site requests are refused',
      async () => {
        for (const request of [
          { ...local, address: '192.0.2.10' },
          { ...local, host: 'attacker.example:5173' },
          { ...local, origin: undefined },
          { ...local, origin: 'http://127.0.0.1:3000' },
          { ...local, fetchSite: 'cross-site' },
        ])
          await denied(options, request)
      },
    )
    await t.test('ordinary users cannot acquire administrator sessions', async () => {
      await denied({ ...options, ownerLoginName: `local-student-${suffix}` }, local)
      assert.equal(await prisma.userSession.count({ where: { organizationId } }), 0)
    })
    let credential: { accessToken: string; expiresAt: string }
    await t.test(
      'entry yields a normal token accepted by existing AuthService and records the actor',
      async () => {
        credential = await access.enter(
          { ...options, organizationId: options.organizationId.toUpperCase() },
          local,
        )
        const session = await auth.requireSession(`Bearer ${credential.accessToken}`)
        assert.equal(session.userId, ownerId)
        assert.equal(session.organizationId, organizationId)
        assert.ok(Date.parse(credential.expiresAt) - Date.now() <= 8 * 60 * 60 * 1000)
        const logs = await prisma.auditLog.findMany({
          where: { organizationId, action: 'LOCAL_OWNER_SESSION_STARTED' },
        })
        assert.equal(logs.length, 1)
        assert.equal(logs[0]?.actorUserId, ownerId)
        assert.equal(JSON.stringify(logs).includes(credential.accessToken), false)
      },
    )
    await t.test(
      'membership suspension invalidates the token and blocks future local entry',
      async () => {
        await prisma.organizationMembership.updateMany({
          where: { organizationId, userId: ownerId },
          data: { status: 'SUSPENDED' },
        })
        await assert.rejects(auth.requireSession(`Bearer ${credential.accessToken}`))
        await denied(options, local)
      },
    )
  } finally {
    if (organizationId) {
      await prisma.auditLog.deleteMany({ where: { organizationId } })
      await prisma.userSession.deleteMany({ where: { organizationId } })
      await prisma.roleAssignment.deleteMany({ where: { organizationId } })
      await prisma.organizationMembership.deleteMany({ where: { organizationId } })
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, studentId].filter(Boolean) } } })
      await prisma.organization.deleteMany({ where: { id: organizationId } })
    }
    if (originalMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalMode
    await prisma.$disconnect()
  }
})
