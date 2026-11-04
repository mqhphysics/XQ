import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { configureApp } from '../app.setup'
import { hashPassword } from '../auth/password'
import { PrismaService } from '../database/prisma.service'
import { ExperienceModule } from '../experience/experience.module'
import { PrismaClient } from '../generated/prisma/client'
import { AdminCenterModule } from './admin-center.module'

function disposableDatabase(): string {
  const value = process.env.TEST_DATABASE_URL
  assert.ok(value, 'Admin center HTTP tests require a disposable TEST_DATABASE_URL')
  const parsed = new URL(value)
  assert.match(decodeURIComponent(parsed.pathname.slice(1)), /(?:^|_)(?:test|ci)(?:_|$)/)
  if (process.env.DATABASE_URL)
    assert.notEqual(value, process.env.DATABASE_URL, 'Never use the daily application database')
  return value
}

test(
  'admin center real HTTP: scoped data, membership/session isolation, CAS and idempotency',
  { timeout: 90000 },
  async (t) => {
    const prisma = new PrismaClient({ datasources: { db: { url: disposableDatabase() } } })
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const password = 'FICTIONAL-Admin-Center-2026!'
    const digest = hashPassword(password)
    let app: INestApplication | undefined
    try {
      const org = await prisma.organization.create({
        data: { slug: `admin-center-${suffix}`, name: 'FICTIONAL_TEST Management Organization' },
      })
      const other = await prisma.organization.create({
        data: { slug: `admin-center-other-${suffix}`, name: 'FICTIONAL_TEST Other Organization' },
      })
      async function user(label: string, organizationId = org.id) {
        return prisma.user.create({
          data: {
            loginNameNormalized: `admin-center-${suffix}-${label}`,
            displayName: `FICTIONAL_TEST_${label}`,
            studentId: `TEST-${suffix}-${label}`,
            email: `${label}-${suffix}@example.test`,
            avatarUrl: `/api/media/avatars/${label}-${suffix}.webp`,
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
      }
      const admin = await user('admin')
      const student = await user('student')
      const target = await user('target')
      const otherUser = await user('outside', other.id)
      const protectedAdmin = await user('protected')
      await prisma.organizationMembership.create({
        data: { organizationId: other.id, userId: target.id, status: 'ACTIVE' },
      })
      for (const userId of [admin.id, protectedAdmin.id])
        await prisma.roleAssignment.create({
          data: {
            userId,
            organizationId: org.id,
            role: 'ORGANIZATION_ADMIN',
            scopeType: 'ORGANIZATION',
            scopeId: org.id,
          },
        })
      const team = await prisma.team.create({
        data: { organizationId: org.id, teamCode: `CENTER-${suffix}`, name: 'FICTIONAL_TEST Team' },
      })
      const otherTeam = await prisma.team.create({
        data: {
          organizationId: other.id,
          teamCode: `CENTER-OTHER-${suffix}`,
          name: 'FICTIONAL_TEST Other Team',
        },
      })
      const player = await prisma.playerProfile.create({
        data: {
          organizationId: org.id,
          displayName: 'FICTIONAL_TEST Player',
          studentId: `PRIVATE-${suffix}`,
          isDemo: true,
        },
      })
      const season = await prisma.season.create({
        data: {
          organizationId: org.id,
          seasonCode: `CENTER-${suffix}`,
          name: 'FICTIONAL_TEST Season',
        },
      })
      const tournament = await prisma.tournament.create({
        data: {
          organizationId: org.id,
          seasonId: season.id,
          tournamentCode: `CENTER-${suffix}`,
          name: 'FICTIONAL_TEST Cup',
          status: 'PUBLISHED',
        },
      })
      const module = await Test.createTestingModule({
        imports: [AdminCenterModule, ExperienceModule],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile()
      app = module.createNestApplication()
      configureApp(app)
      await app.init()
      const http = request(app.getHttpServer())
      async function login(username: string, organizationId = org.id): Promise<string> {
        const result = await http
          .post('/api/auth/login')
          .set('x-organization-id', organizationId)
          .send({ username, password })
          .expect(200)
        return result.body.accessToken as string
      }
      const token = await login(admin.loginNameNormalized!)
      const studentToken = await login(student.loginNameNormalized!)
      const targetToken = await login(target.loginNameNormalized!)
      const otherTargetToken = await login(target.loginNameNormalized!, other.id)
      const auth = `Bearer ${token}`
      const key = () => randomUUID()
      const reason = 'FICTIONAL_TEST documented operator action'

      await t.test(
        'workspace inbox counts pending identities and drafts within this organization without audit secrets',
        async () => {
          const records: {
            student: string[]
            application: string[]
            post: string[]
            audit: string[]
          } = { student: [], application: [], post: [], audit: [] }
          try {
            for (const [organizationId, userId] of [
              [org.id, student.id],
              [other.id, otherUser.id],
            ] as const) {
              records.student.push(
                (
                  await prisma.studentRecord.create({
                    data: {
                      organizationId,
                      realName: '虚构测试学生',
                      studentNumber: '9900000001',
                      cohort: 'ADMIN_WORKSPACE_TEST',
                      isDemo: true,
                    },
                  })
                ).id,
              )
              records.application.push(
                (
                  await prisma.identityApplication.create({
                    data: {
                      organizationId,
                      userId,
                      kind: 'STUDENT',
                      message: '虚构身份待核验',
                      status: 'PENDING',
                    },
                  })
                ).id,
              )
              records.post.push(
                (
                  await prisma.post.create({
                    data: {
                      organizationId,
                      authorUserId: userId,
                      type: 'COMMUNITY',
                      title: 'FICTIONAL_TEST 待审核',
                      body: '验证管理工作台，不对外发布。',
                      status: 'DRAFT',
                    },
                  })
                ).id,
              )
              records.audit.push(
                (
                  await prisma.auditLog.create({
                    data: {
                      organizationId,
                      actorType: 'ADMIN',
                      action: 'STUDENT_RECORD_UPDATED',
                      targetType: 'StudentRecord',
                      targetId: records.student.at(-1)!,
                      reason:
                        organizationId === org.id ? '本组织测试操作' : 'FOREIGN_AUDIT_PRIVATE',
                      requestId: randomUUID(),
                      source: 'FICTIONAL_TEST',
                      afterSummary: { privateValue: digest.hash },
                    },
                  })
                ).id,
              )
            }
            records.audit.push(
              (
                await prisma.auditLog.create({
                  data: {
                    organizationId: org.id,
                    actorType: 'ADMIN',
                    action: 'ADMIN_LOGIN_PASSWORD_VIEWED',
                    targetType: 'User',
                    targetId: target.id,
                    reason: 'PASSWORD_VIEW_REASON_PRIVATE',
                    requestId: randomUUID(),
                    source: 'FICTIONAL_TEST',
                  },
                })
              ).id,
            )
            const overview = await http
              .get('/api/admin/center/overview')
              .set('authorization', auth)
              .expect(200)
            assert.equal(overview.body.counts.pendingIdentities, 1)
            assert.equal(overview.body.counts.pendingPosts, 1)
            assert.equal(overview.body.counts.students, 1)
            assert.equal(overview.body.counts.openCorrections, 0)
            assert.equal(overview.body.counts.pendingReinstatements, 0)
            assert.equal(overview.body.counts.users, 4)
            assert(
              overview.body.recentAudit.some(
                (entry: { reason: string }) => entry.reason === '本组织测试操作',
              ),
            )
            const serialized = JSON.stringify(overview.body)
            for (const secret of [
              'FOREIGN_AUDIT_PRIVATE',
              'PASSWORD_VIEW_REASON_PRIVATE',
              digest.hash,
              digest.salt,
            ])
              assert(!serialized.includes(secret))
            await http
              .get('/api/admin/center/overview')
              .set('authorization', `Bearer ${studentToken}`)
              .expect(403)
            await http
              .get('/api/admin/center/overview')
              .set('authorization', auth)
              .set('x-organization-id', other.id)
              .expect(403)
          } finally {
            await prisma.auditLog.deleteMany({ where: { id: { in: records.audit } } })
            await prisma.post.deleteMany({ where: { id: { in: records.post } } })
            await prisma.identityApplication.deleteMany({
              where: { id: { in: records.application } },
            })
            await prisma.studentRecord.deleteMany({ where: { id: { in: records.student } } })
          }
        },
      )

      await t.test(
        'anonymous and ordinary users cannot read management data or write profiles',
        async () => {
          await http.get('/api/admin/center/users').expect(401)
          await http
            .get('/api/admin/center/users')
            .set('authorization', `Bearer ${studentToken}`)
            .expect(403)
          await http
            .patch(`/api/admin/center/teams/${team.id}`)
            .set('authorization', `Bearer ${studentToken}`)
            .set('idempotency-key', key())
            .send({
              expectedUpdatedAt: team.updatedAt.toISOString(),
              reason,
              patch: { name: 'Unauthorized' },
            })
            .expect(403)
          await http
            .get('/api/admin/center/users')
            .set('authorization', auth)
            .set('x-organization-id', other.id)
            .expect(403)
        },
      )

      await t.test(
        'privileged user pages include identity, omit password material and exclude foreign organization',
        async () => {
          const result = await http
            .get('/api/admin/center/users?pageSize=2')
            .set('authorization', auth)
            .expect(200)
          assert.equal(result.body.total, 4)
          assert.equal(result.body.items.length, 2)
          const all = await http
            .get('/api/admin/center/users?pageSize=100')
            .set('authorization', auth)
            .expect(200)
          assert.ok(all.body.items.every((item: { id: string }) => item.id !== otherUser.id))
          const serialized = JSON.stringify(all.body)
          for (const privateValue of [digest.hash, digest.salt])
            assert.ok(!serialized.includes(privateValue))
          assert.equal(
            all.body.items.find((item: { id: string }) => item.id === target.id).studentId,
            target.studentId,
          )
          assert.equal(
            all.body.items.find((item: { id: string }) => item.id === target.id).email,
            target.email,
          )
          assert.ok(
            all.body.items.find((item: { id: string }) => item.id === target.id).hasPassword,
          )
          await http
            .get('/api/admin/center/users?pageSize=101')
            .set('authorization', auth)
            .expect(400)
        },
      )

      await t.test(
        'membership suspension revokes only this organization, protects administrators, replays safely',
        async () => {
          const member = await prisma.organizationMembership.findUniqueOrThrow({
            where: { organizationId_userId: { organizationId: org.id, userId: target.id } },
          })
          const body = {
            status: 'SUSPENDED',
            expectedUpdatedAt: member.updatedAt.toISOString(),
            reason,
          }
          const requestKey = key()
          const first = await http
            .post(`/api/admin/center/users/${target.id}/membership`)
            .set('authorization', auth)
            .set('idempotency-key', requestKey)
            .send(body)
            .expect(200)
          const repeat = await http
            .post(`/api/admin/center/users/${target.id}/membership`)
            .set('authorization', auth)
            .set('idempotency-key', requestKey)
            .send(body)
            .expect(200)
          assert.deepEqual(repeat.body, first.body)
          assert.equal(
            (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status,
            'ACTIVE',
          )
          await http.get('/api/auth/me').set('authorization', `Bearer ${targetToken}`).expect(401)
          await http
            .get('/api/auth/me')
            .set('authorization', `Bearer ${otherTargetToken}`)
            .expect(200)
          await http
            .post(`/api/admin/center/users/${admin.id}/membership`)
            .set('authorization', auth)
            .set('idempotency-key', key())
            .send(body)
            .expect(403)
          await http
            .post(`/api/admin/center/users/${protectedAdmin.id}/membership`)
            .set('authorization', auth)
            .set('idempotency-key', key())
            .send(body)
            .expect(403)
          await http
            .post(`/api/admin/center/users/${otherUser.id}/membership`)
            .set('authorization', auth)
            .set('idempotency-key', key())
            .send(body)
            .expect(404)
          await http
            .post(`/api/admin/center/users/${target.id}/membership`)
            .set('authorization', auth)
            .set('idempotency-key', requestKey)
            .send({ ...body, status: 'ACTIVE' })
            .expect(409)
          await http
            .post(`/api/admin/center/users/${target.id}/membership`)
            .set('authorization', auth)
            .set('idempotency-key', key())
            .send({ status: 'ACTIVE', expectedUpdatedAt: first.body.membershipUpdatedAt, reason })
            .expect(200)
          await http
            .post(`/api/admin/center/users/${target.id}/membership`)
            .set('authorization', auth)
            .set('idempotency-key', requestKey)
            .send(body)
            .expect(200)
          assert.equal(
            (await prisma.organizationMembership.findUniqueOrThrow({ where: { id: member.id } }))
              .status,
            'ACTIVE',
          )
          assert.equal(
            await prisma.auditLog.count({
              where: {
                organizationId: org.id,
                action: 'ORGANIZATION_MEMBERSHIP_UPDATED',
                targetId: target.id,
              },
            }),
            2,
          )
        },
      )

      await t.test(
        'single-user session revocation is scoped, repeatable and denies own session',
        async () => {
          const renewed = await login(target.loginNameNormalized!)
          const requestKey = key()
          const first = await http
            .post(`/api/admin/center/users/${target.id}/revoke-sessions`)
            .set('authorization', auth)
            .set('idempotency-key', requestKey)
            .send({ reason })
            .expect(200)
          const repeat = await http
            .post(`/api/admin/center/users/${target.id}/revoke-sessions`)
            .set('authorization', auth)
            .set('idempotency-key', requestKey)
            .send({ reason })
            .expect(200)
          assert.deepEqual(repeat.body, first.body)
          assert.equal(first.body.revokedCount, 1)
          await http.get('/api/auth/me').set('authorization', `Bearer ${renewed}`).expect(401)
          await http
            .get('/api/auth/me')
            .set('authorization', `Bearer ${otherTargetToken}`)
            .expect(200)
          await http
            .post(`/api/admin/center/users/${admin.id}/revoke-sessions`)
            .set('authorization', auth)
            .set('idempotency-key', key())
            .send({ reason })
            .expect(403)
        },
      )

      await t.test(
        'profile writes use stable IDs, whitelist, audit and CAS; duplicate saves create one effect',
        async () => {
          const requestKey = key()
          const body = {
            expectedUpdatedAt: team.updatedAt.toISOString(),
            reason,
            patch: { name: 'FICTIONAL_TEST Updated Team', description: 'Checked public profile' },
          }
          const responses = await Promise.all(
            [0, 1].map(() =>
              http
                .patch(`/api/admin/center/teams/${team.id}`)
                .set('authorization', auth)
                .set('idempotency-key', requestKey)
                .send(body),
            ),
          )
          assert.ok(responses.every((response) => response.status === 200))
          assert.deepEqual(responses[0]!.body, responses[1]!.body)
          assert.equal(
            await prisma.auditLog.count({
              where: { organizationId: org.id, action: 'TEAM_PROFILE_UPDATED', targetId: team.id },
            }),
            1,
          )
          await http
            .patch(`/api/admin/center/teams/${team.id}`)
            .set('authorization', auth)
            .set('idempotency-key', key())
            .send(body)
            .expect(409)
          await http
            .patch(`/api/admin/center/teams/${otherTeam.id}`)
            .set('authorization', auth)
            .set('idempotency-key', key())
            .send(body)
            .expect(404)
          await http
            .patch(`/api/admin/center/players/${player.id}`)
            .set('authorization', auth)
            .set('idempotency-key', key())
            .send({
              expectedUpdatedAt: player.updatedAt.toISOString(),
              reason,
              patch: { sourceKey: 'Overwrite' },
            })
            .expect(400)
          await http
            .patch(`/api/admin/center/players/${player.id}`)
            .set('authorization', auth)
            .set('idempotency-key', key())
            .send({
              expectedUpdatedAt: player.updatedAt.toISOString(),
              reason,
              patch: { displayName: 'FICTIONAL_TEST New Player', position: 'FORWARD' },
            })
            .expect(200)
          const players = await http
            .get('/api/admin/center/players')
            .set('authorization', auth)
            .expect(200)
          assert.equal(
            players.body.items.find((item: { id: string }) => item.id === player.id).studentId,
            player.studentId,
          )
        },
      )

      await t.test(
        'official publications appear in the public feed; moderation is versioned and retained',
        async () => {
          const requestKey = key()
          const body = {
            tournamentId: tournament.id,
            title: 'FICTIONAL_TEST Announcement',
            body: 'A synthetic announcement for real API verification.',
            reason,
          }
          const created = await http
            .post('/api/admin/center/posts')
            .set('authorization', auth)
            .set('idempotency-key', requestKey)
            .send(body)
            .expect(200)
          const repeat = await http
            .post('/api/admin/center/posts')
            .set('authorization', auth)
            .set('idempotency-key', requestKey)
            .send(body)
            .expect(200)
          assert.deepEqual(repeat.body, created.body)
          const publicResult = await http
            .get(`/api/public/posts?tournamentId=${tournament.id}`)
            .set('authorization', `Bearer ${studentToken}`)
            .set('x-organization-id', org.id)
            .expect(200)
          assert.ok(
            publicResult.body.items.some((item: { id: string }) => item.id === created.body.id),
          )
          await http
            .patch(`/api/admin/center/posts/${created.body.id}`)
            .set('authorization', auth)
            .set('idempotency-key', key())
            .send({
              expectedUpdatedAt: created.body.updatedAt,
              reason,
              patch: { status: 'HIDDEN' },
            })
            .expect(200)
          const hidden = await http
            .get(`/api/public/posts?tournamentId=${tournament.id}`)
            .set('authorization', `Bearer ${studentToken}`)
            .set('x-organization-id', org.id)
            .expect(200)
          assert.ok(!hidden.body.items.some((item: { id: string }) => item.id === created.body.id))
          assert.ok(await prisma.post.findUnique({ where: { id: created.body.id } }))
        },
      )

      await t.test(
        'audit/media/system/overview use real bounded data and retain unknown operational status',
        async () => {
          await prisma.auditLog.create({
            data: {
              organizationId: org.id,
              actorType: 'ADMIN',
              actorUserId: admin.id,
              action: 'FICTIONAL_SECRET_TEST',
              targetType: 'User',
              targetId: target.id,
              beforeSummary: {
                studentId: 'PRIVATE_SENSITIVE_ID',
                passwordHash: 'PRIVATE_HASH',
                fields: { body: 'PRIVATE_MESSAGE' },
                version: 7,
              },
              requestId: suffix,
              source: 'FICTIONAL_TEST',
            },
          })
          const audits = await http
            .get('/api/admin/center/audit')
            .set('authorization', auth)
            .expect(200)
          assert.ok(!JSON.stringify(audits.body).includes('PRIVATE_'))
          const media = await http
            .get('/api/admin/center/media')
            .set('authorization', auth)
            .expect(200)
          assert.ok(media.body.total >= 4)
          assert.ok(
            media.body.items.every((item: { ownerId: string }) => item.ownerId !== otherUser.id),
          )
          const overview = await http
            .get('/api/admin/center/overview')
            .set('authorization', auth)
            .expect(200)
          assert.equal(overview.body.counts.users, 4)
          assert.equal(overview.body.counts.teams, 1)
          assert.equal(overview.body.counts.players, 1)
          const system = await http
            .get('/api/admin/center/system')
            .set('authorization', auth)
            .expect(200)
          assert.equal(system.body.worker.status, 'UNKNOWN')
          assert.equal(system.body.storage.status, 'UNMEASURED')
          assert.equal(system.body.backup.status, 'UNVERIFIED')
          assert.equal(system.body.database.status, 'ok')
        },
      )
    } finally {
      if (app) await app.close()
      await prisma.$disconnect()
    }
  },
)
