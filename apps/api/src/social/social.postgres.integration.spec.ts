import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { hashPassword } from '../auth/password'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'

function isolatedDatabaseUrl(value: string): string {
  const parsed = new URL(value)
  const name = decodeURIComponent(parsed.pathname.slice(1))
  assert.match(
    name,
    /(?:^|_)(?:test|ci)(?:_|$)/,
    'Use a dedicated test/CI database, never the daily database',
  )
  if (process.env.DATABASE_URL) {
    const daily = new URL(process.env.DATABASE_URL)
    const same =
      daily.hostname === parsed.hostname &&
      (daily.port || '5432') === (parsed.port || '5432') &&
      daily.pathname === parsed.pathname
    assert.ok(
      !same || (process.env.CI === 'true' && name === 'xiaoqiu_ci'),
      'Test database must be separate from the local application database',
    )
  }
  return value
}

test('backend integration refuses the ordinary application database', () => {
  assert.throws(() =>
    isolatedDatabaseUrl('postgresql://fictional:fictional@127.0.0.1:5432/xiaoqiu'),
  )
})

const configuredUrl = process.env.TEST_DATABASE_URL

test(
  'PostgreSQL auth, captain and feedback HTTP round trips (requires TEST_DATABASE_URL)',
  {
    skip: !configuredUrl,
    timeout: 60_000,
  },
  async (t) => {
    assert.ok(configuredUrl)
    const prisma = new PrismaClient({
      datasources: { db: { url: isolatedDatabaseUrl(configuredUrl) } },
    })
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const userIds: string[] = [],
      organizationIds: string[] = []
    const password = 'Fictional-roundtrip-2026!'
    const digest = hashPassword(password)
    let app: INestApplication | undefined

    const createUser = async (
      label: string,
      organizationId: string,
      status: 'ACTIVE' | 'FROZEN' = 'ACTIVE',
    ) => {
      const account = await prisma.user.create({
        data: {
          loginNameNormalized: `roundtrip-${suffix}-${label}`,
          displayName: `虚构测试-${label}`,
          realName: '虚构测试姓名',
          realNameNormalized: '虚构测试姓名',
          email: `${label}-${suffix}@example.invalid`,
          emailNormalized: `${label}-${suffix}@example.invalid`,
          status,
          memberships: { create: { organizationId, status: 'ACTIVE' } },
          passwordCredential: {
            create: {
              passwordHash: digest.hash,
              passwordSalt: digest.salt,
              algorithm: digest.algorithm,
            },
          },
        },
      })
      userIds.push(account.id)
      return account
    }

    try {
      const organization = await prisma.organization.create({
        data: { slug: `fictional-backend-${suffix}`, name: 'FICTIONAL_TEST 后端闭环组织' },
      })
      organizationIds.push(organization.id)
      const otherOrganization = await prisma.organization.create({
        data: { slug: `fictional-other-${suffix}`, name: 'FICTIONAL_TEST 其他组织' },
      })
      organizationIds.push(otherOrganization.id)
      const student = await createUser('student', organization.id)
      const captain = await createUser('captain', organization.id)
      const admin = await createUser('admin', organization.id)
      const disabledAdmin = await createUser('disabled-admin', organization.id, 'FROZEN')
      const outsider = await createUser('outsider', otherOrganization.id)
      const inaccessiblePlatformAdmin = await createUser('platform-other', otherOrganization.id)
      const team = await prisma.team.create({
        data: {
          organizationId: organization.id,
          teamCode: `TEST-${suffix}`,
          name: 'FICTIONAL_TEST 有队长球队',
        },
      })
      const fallbackTeam = await prisma.team.create({
        data: {
          organizationId: organization.id,
          teamCode: `TEST-FALLBACK-${suffix}`,
          name: 'FICTIONAL_TEST 无队长球队',
        },
      })
      const captainRole = await prisma.roleAssignment.create({
        data: {
          userId: captain.id,
          organizationId: organization.id,
          role: 'TEAM_CAPTAIN',
          scopeType: 'TEAM',
          scopeId: team.id,
        },
      })
      await prisma.roleAssignment.createMany({
        data: [
          {
            userId: admin.id,
            organizationId: organization.id,
            role: 'ORGANIZATION_ADMIN',
            scopeType: 'ORGANIZATION',
            scopeId: organization.id,
          },
          {
            userId: admin.id,
            organizationId: null,
            role: 'PLATFORM_ADMIN',
            scopeType: 'PLATFORM',
            scopeId: `global-${suffix}`,
          },
          {
            userId: disabledAdmin.id,
            organizationId: organization.id,
            role: 'ORGANIZATION_ADMIN',
            scopeType: 'ORGANIZATION',
            scopeId: organization.id,
          },
          {
            userId: inaccessiblePlatformAdmin.id,
            organizationId: null,
            role: 'PLATFORM_ADMIN',
            scopeType: 'PLATFORM',
            scopeId: `other-global-${suffix}`,
          },
          {
            userId: outsider.id,
            organizationId: otherOrganization.id,
            role: 'ORGANIZATION_ADMIN',
            scopeType: 'ORGANIZATION',
            scopeId: otherOrganization.id,
          },
        ],
      })
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile()
      app = module.createNestApplication()
      app.useLogger(false)
      configureApp(app)
      await app.init()
      const server = app.getHttpServer()
      const login = async (account: typeof student, orgId = organization.id) => {
        const response = await request(server)
          .post('/api/auth/login')
          .set('x-dev-organization-id', orgId)
          .send({ username: account.loginNameNormalized, password })
          .expect(200)
        return `Bearer ${response.body.accessToken}`
      }
      const studentToken = await login(student),
        captainToken = await login(captain)
      const adminToken = await login(admin),
        outsiderToken = await login(outsider, otherOrganization.id)

      await t.test(
        'identity refresh returns current profile and roles as uncached JSON',
        async () => {
          const me = await request(server)
            .get('/api/auth/me')
            .set('authorization', studentToken)
            .set('If-None-Match', '*')
            .expect(200)
          assert.match(String(me.headers['cache-control']), /no-store/)
          assert.match(String(me.headers.vary), /Authorization/)
          await request(server)
            .patch('/api/auth/me')
            .set('authorization', studentToken)
            .send({
              displayName: '虚构更新资料',
              email: student.email,
              bio: 'FICTIONAL_TEST 更新说明',
            })
            .expect(200)
          const updated = await request(server)
            .get('/api/auth/me')
            .set('authorization', studentToken)
            .expect(200)
          assert.equal(updated.body.displayName, '虚构更新资料')
          assert.equal(updated.body.bio, 'FICTIONAL_TEST 更新说明')
          await request(server)
            .patch('/api/auth/me')
            .set('authorization', studentToken)
            .send({ displayName: '虚构更新资料', email: admin.email })
            .expect(409)
        },
      )

      await t.test(
        'registration automatically signs into the new account despite a numeric identifier collision',
        async () => {
          await prisma.user.update({ where: { id: captain.id }, data: { studentId: '2099990001' } })
          const result = await request(server)
            .post('/api/auth/register')
            .set('x-dev-organization-id', organization.id)
            .send({
              username: '2099990001',
              studentId: '2099990002',
              displayName: '虚构新注册用户',
              realName: '虚构注册姓名',
              email: `registered-${suffix}@example.invalid`,
              password,
            })
            .expect(201)
          userIds.push(result.body.user.id as string)
          assert.notEqual(result.body.user.id, captain.id)
          assert.equal(result.body.user.email, `registered-${suffix}@example.invalid`)
          await request(server)
            .get('/api/auth/me')
            .set('authorization', `Bearer ${result.body.accessToken}`)
            .expect(200)
        },
      )

      await t.test(
        'feedback reaches the accessible administrator once, saves a full reply and survives idempotent retry',
        async () => {
          const input = {
            targetType: 'FEEDBACK',
            reason: '虚构功能问题',
            details: 'FICTIONAL_TEST 请求处理',
            clientReportId: `feedback-${suffix}`,
          }
          const [created, concurrent] = await Promise.all(
            [1, 2].map(() =>
              request(server)
                .post('/api/reports')
                .set('authorization', studentToken)
                .send(input)
                .expect(201),
            ),
          )
          assert.ok(created && concurrent)
          const id = created.body.id as string
          assert.equal(concurrent.body.id, id)
          const duplicate = await request(server)
            .post('/api/reports')
            .set('authorization', studentToken)
            .send(input)
            .expect(201)
          assert.equal(duplicate.body.id, id)
          const received = await prisma.userNotification.findMany({
            where: { organizationId: organization.id, deduplicationKey: `report-created:${id}` },
          })
          assert.deepEqual(
            received.map((n) => n.recipientUserId),
            [admin.id],
          )
          const queue = await request(server)
            .get('/api/admin/reports')
            .set('authorization', adminToken)
            .expect(200)
          assert.ok(queue.body.items.some((item: { id: string }) => item.id === id))
          await request(server)
            .get('/api/admin/reports')
            .set('authorization', studentToken)
            .expect(403)
          await request(server)
            .put(`/api/admin/reports/${id}`)
            .set('authorization', outsiderToken)
            .send({ status: 'RESOLVED', resolution: '虚构越权回复' })
            .expect(404)
          const resolution = '测'.repeat(1000)
          const review = { status: 'RESOLVED', resolution }
          await request(server)
            .put(`/api/admin/reports/${id}`)
            .set('authorization', adminToken)
            .send(review)
            .expect(200)
          const myReports = await request(server)
            .get('/api/me/reports')
            .set('authorization', studentToken)
            .expect(200)
          assert.equal(
            myReports.body.items.find((item: { id: string }) => item.id === id).resolution,
            resolution,
          )
          const notification = await prisma.userNotification.findFirstOrThrow({
            where: {
              recipientUserId: student.id,
              deduplicationKey: `report-updated:${id}:RESOLVED`,
            },
          })
          assert.equal(Array.from(notification.body!).length, 500)
          await request(server)
            .put(`/api/me/notifications/${notification.id}/read`)
            .set('authorization', studentToken)
            .expect(200)
          const readAt = (
            await prisma.userNotification.findUniqueOrThrow({ where: { id: notification.id } })
          ).readAt!
          await request(server)
            .put(`/api/admin/reports/${id}`)
            .set('authorization', adminToken)
            .send(review)
            .expect(200)
          await request(server)
            .put(`/api/me/notifications/${notification.id}/read`)
            .set('authorization', studentToken)
            .expect(200)
          assert.equal(
            (
              await prisma.userNotification.findUniqueOrThrow({ where: { id: notification.id } })
            ).readAt!.getTime(),
            readAt.getTime(),
          )
          assert.equal(
            await prisma.auditLog.count({
              where: {
                organizationId: organization.id,
                targetId: id,
                action: 'CONTENT_REPORT_REVIEWED',
              },
            }),
            1,
          )
          await request(server)
            .put(`/api/admin/reports/${id}`)
            .set('authorization', adminToken)
            .send({ status: 'IN_REVIEW', resolution: '虚构重新打开' })
            .expect(409)
        },
      )

      await t.test(
        'an applicant receives the captain decision and pending retries do not reset notification read state',
        async () => {
          const input = { requestedPosition: 'MIDFIELDER', message: 'FICTIONAL_TEST 请求入队' }
          const created = await request(server)
            .post(`/api/teams/${team.id}/join-applications`)
            .set('authorization', studentToken)
            .send(input)
            .expect(201)
          const id = created.body.application.id as string
          const notification = await prisma.userNotification.findFirstOrThrow({
            where: { recipientUserId: captain.id, deduplicationKey: `team-application:${id}` },
          })
          await request(server)
            .put(`/api/me/notifications/${notification.id}/read`)
            .set('authorization', captainToken)
            .expect(200)
          const readAt = (
            await prisma.userNotification.findUniqueOrThrow({ where: { id: notification.id } })
          ).readAt!
          await request(server)
            .post(`/api/teams/${team.id}/join-applications`)
            .set('authorization', studentToken)
            .send(input)
            .expect(201)
          assert.equal(
            (
              await prisma.userNotification.findUniqueOrThrow({ where: { id: notification.id } })
            ).readAt!.getTime(),
            readAt.getTime(),
          )
          await request(server)
            .put(`/api/captain/teams/${team.id}/applications/${id}`)
            .set('authorization', studentToken)
            .send({ decision: 'APPROVED' })
            .expect(403)
          await request(server)
            .put(`/api/captain/teams/${team.id}/applications/${id}`)
            .set('authorization', captainToken)
            .send({ decision: 'APPROVED', note: '虚构批准入队' })
            .expect(200)
          await request(server)
            .put(`/api/captain/teams/${team.id}/applications/${id}`)
            .set('authorization', captainToken)
            .send({ decision: 'APPROVED', note: '虚构批准入队' })
            .expect(200)
          await request(server)
            .put(`/api/captain/teams/${team.id}/applications/${id}`)
            .set('authorization', captainToken)
            .send({ decision: 'REJECTED', note: '虚构覆盖已有决定' })
            .expect(409)
          const relationship = await request(server)
            .get(`/api/teams/${team.id}/relationship`)
            .set('authorization', studentToken)
            .expect(200)
          assert.equal(relationship.body.membershipStatus, 'ACTIVE')
          const notices = await request(server)
            .get('/api/me/notifications')
            .set('authorization', studentToken)
            .expect(200)
          assert.ok(
            notices.body.items.some((n: { type: string }) => n.type === 'TEAM_APPLICATION_DECIDED'),
          )
          assert.equal(
            await prisma.auditLog.count({
              where: {
                organizationId: organization.id,
                targetId: id,
                action: 'TEAM_APPLICATION_REVIEWED',
              },
            }),
            1,
          )
        },
      )

      await t.test(
        'a team without an active captain falls back to its organization administrator',
        async () => {
          const [created, duplicate] = await Promise.all(
            [1, 2].map(() =>
              request(server)
                .post(`/api/teams/${fallbackTeam.id}/join-applications`)
                .set('authorization', studentToken)
                .send({ message: 'FICTIONAL_TEST 无队长申请' })
                .expect(201),
            ),
          )
          assert.ok(created && duplicate)
          const id = created.body.application.id as string
          assert.equal(duplicate.body.application.id, id)
          const received = await prisma.userNotification.findMany({
            where: { organizationId: organization.id, deduplicationKey: `team-application:${id}` },
          })
          assert.deepEqual(
            received.map((n) => n.recipientUserId),
            [admin.id],
          )
          await request(server)
            .get(`/api/captain/teams/${fallbackTeam.id}`)
            .set('authorization', captainToken)
            .expect(403)
          await request(server)
            .put(`/api/captain/teams/${fallbackTeam.id}/applications/${id}`)
            .set('authorization', adminToken)
            .send({ decision: 'REJECTED', note: '虚构退回申请' })
            .expect(200)
          await request(server)
            .put(`/api/me/notifications/${received[0]!.id}/read`)
            .set('authorization', adminToken)
            .expect(200)
          await prisma.userNotification.update({
            where: { id: received[0]!.id },
            data: { createdAt: new Date('2020-01-01') },
          })
          await prisma.userNotification.createMany({
            data: Array.from({ length: 101 }, (_, i) => ({
              organizationId: organization.id,
              recipientUserId: admin.id,
              type: 'TEAM_APPLICATION',
              title: `FICTIONAL_TEST 后续通知 ${i}`,
              readAt: new Date(),
            })),
          })
          await request(server)
            .post(`/api/teams/${fallbackTeam.id}/join-applications`)
            .set('authorization', studentToken)
            .send({ message: 'FICTIONAL_TEST 无队长申请' })
            .expect(201)
          const fresh = await request(server)
            .get('/api/me/notifications')
            .set('authorization', adminToken)
            .expect(200)
          assert.ok(
            fresh.body.items.some(
              (n: { id: string; readAt: string | null }) =>
                n.id === received[0]!.id && n.readAt === null,
            ),
          )
        },
      )

      await t.test(
        'revoked captain roles, suspended members, expired sessions and logout immediately remove access',
        async () => {
          await prisma.roleAssignment.update({
            where: { id: captainRole.id },
            data: { revokedAt: new Date() },
          })
          await request(server)
            .get(`/api/captain/teams/${team.id}`)
            .set('authorization', captainToken)
            .expect(403)
          assert.equal(
            (
              await request(server)
                .get('/api/auth/me')
                .set('authorization', captainToken)
                .expect(200)
            ).body.roles.length,
            0,
          )
          await prisma.organizationMembership.updateMany({
            where: { userId: captain.id, organizationId: organization.id },
            data: { status: 'SUSPENDED' },
          })
          await request(server).get('/api/auth/me').set('authorization', captainToken).expect(401)
          const expired = await login(student)
          await prisma.userSession.updateMany({
            where: { userId: student.id },
            data: { expiresAt: new Date(Date.now() - 1) },
          })
          await request(server).get('/api/auth/me').set('authorization', expired).expect(401)
          const current = await login(student)
          await request(server).post('/api/auth/logout').set('authorization', current).expect(204)
          await request(server).get('/api/auth/me').set('authorization', current).expect(401)
        },
      )
    } finally {
      // Only this fixture's random IDs are removed; no blanket delete or demo Seed.
      if (organizationIds.length) {
        const scoped = { organizationId: { in: organizationIds } }
        await prisma.userNotification.deleteMany({ where: scoped })
        await prisma.contentReport.deleteMany({ where: scoped })
        await prisma.teamJoinApplication.deleteMany({ where: scoped })
        await prisma.teamMembership.deleteMany({ where: scoped })
        await prisma.auditLog.deleteMany({ where: scoped })
        await prisma.roleAssignment.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.team.deleteMany({ where: scoped })
        await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.organizationMembership.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.passwordCredential.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.user.deleteMany({ where: { id: { in: userIds } } })
        await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } })
      }
      if (app) await app.close()
      await prisma.$disconnect()
    }
  },
)
