import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import sharp from 'sharp'
import type { INestApplication } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { hashPassword } from '../auth/password'
import { configureApp } from '../app.setup'
import { ExperienceModule } from '../experience/experience.module'
import { AdminCenterModule } from './admin-center.module'

test(
  'management governance real HTTP: editable identities, activities, sanctions, reviews and media read gates',
  { timeout: 90000 },
  async (t) => {
    const database = process.env.TEST_DATABASE_URL
    assert.ok(database)
    assert.match(new URL(database).pathname, /test|ci/)
    assert.notEqual(database, process.env.DATABASE_URL)
    const prisma = new PrismaService({ datasources: { db: { url: database } } })
    const suffix = randomUUID().slice(0, 8),
      password = 'FICTIONAL-Management-2026!',
      digest = hashPassword(password)
    const runtime = resolve(__dirname, '../../../../../private-data/runtime')
    const storage = await mkdtemp(resolve(runtime, 'governance-'))
    const previousStorage = process.env.POST_MEDIA_DIRECTORY
    const previousPasswordKey = process.env.ADMIN_PASSWORD_KEY_FILE
    process.env.POST_MEDIA_DIRECTORY = storage
    process.env.ADMIN_PASSWORD_KEY_FILE = resolve(storage, 'password.key')
    const createdAccountIds: string[] = []
    let org = '',
      otherOrg = ''
    let app: INestApplication | undefined
    try {
      org = (
        await prisma.organization.create({
          data: { slug: `gov-${suffix}`, name: 'FICTIONAL_TEST Management' },
        })
      ).id
      otherOrg = (
        await prisma.organization.create({
          data: { slug: `gov-other-${suffix}`, name: 'FICTIONAL_TEST Other' },
        })
      ).id
      async function user(name: string, organizationId = org) {
        return prisma.user.create({
          data: {
            loginNameNormalized: `gov-${name}-${suffix}`,
            displayName: `FICTIONAL_TEST ${name}`,
            realName: `TEST ${name}`,
            studentId: `TEST-${name}-${suffix}`,
            email: `${name}-${suffix}@example.test`,
            emailNormalized: `${name}-${suffix}@example.test`,
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
      const admin = await user('admin'),
        student = await user('student'),
        outside = await user('outside', otherOrg)
      await prisma.roleAssignment.create({
        data: {
          organizationId: org,
          userId: admin.id,
          role: 'ORGANIZATION_ADMIN',
          scopeType: 'ORGANIZATION',
          scopeId: org,
        },
      })
      const season = await prisma.season.create({
        data: { organizationId: org, seasonCode: `TEST-${suffix}`, name: 'FICTIONAL_TEST Season' },
      })
      const tournament = await prisma.tournament.create({
        data: {
          organizationId: org,
          seasonId: season.id,
          tournamentCode: `TEST-${suffix}`,
          name: 'FICTIONAL_TEST Tournament',
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
      const http = app.getHttpServer()
      async function login(name: string) {
        const r = await request(http)
          .post('/api/auth/login')
          .set('x-organization-id', org)
          .send({ username: `gov-${name}-${suffix}`, password })
        assert.equal(r.status, 200)
        return r.body.accessToken as string
      }
      const adminToken = await login('admin')
      let userToken = await login('student')
      const adminGet = (path: string) =>
        request(http)
          .get('/api' + path)
          .set('Authorization', `Bearer ${adminToken}`)
      const key = () => randomUUID()
      assert.equal((await adminGet('/admin/center/media/preview')).status, 400)
      await t.test(
        'privileged directory shows full identity while guests, ordinary and foreign users are rejected',
        async () => {
          assert.equal((await request(http).get('/api/admin/center/users')).status, 401)
          assert.equal(
            (
              await request(http)
                .get('/api/admin/center/users')
                .set('Authorization', `Bearer ${userToken}`)
            ).status,
            403,
          )
          const list = await adminGet('/admin/center/users')
          assert.equal(list.status, 200)
          const row = list.body.items.find((r: { id: string }) => r.id === student.id)
          assert.equal(row.studentId, student.studentId)
          assert.equal(row.email, student.email)
          assert.equal((await adminGet(`/admin/center/users/${outside.id}`)).status, 404)
          assert.ok(
            await prisma.auditLog.count({
              where: { organizationId: org, action: 'USER_DIRECTORY_VIEWED' },
            }),
          )
        },
      )
      await t.test(
        'user profile correction persists, idempotent replay succeeds and stale or conflicting identity fails',
        async () => {
          const detail = (await adminGet(`/admin/center/users/${student.id}`)).body
          const idempotency = key()
          const body = {
            expectedUpdatedAt: detail.updatedAt,
            reason: 'FICTIONAL_TEST correct profile',
            patch: {
              realName: 'TEST Revised Name',
              email: `revised-${suffix}@example.test`,
              studentId: `TEST-REVISED-${suffix}`,
              bio: 'TEST bio',
            },
          }
          const first = await request(http)
            .patch(`/api/admin/center/users/${student.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Idempotency-Key', idempotency)
            .send(body)
          assert.equal(first.status, 200)
          assert.equal(
            (
              await request(http)
                .patch(`/api/admin/center/users/${student.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('Idempotency-Key', idempotency)
                .send(body)
            ).status,
            200,
          )
          assert.equal(
            (
              await request(http)
                .patch(`/api/admin/center/users/${student.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('Idempotency-Key', key())
                .send(body)
            ).status,
            409,
          )
          const current = await prisma.user.findUniqueOrThrow({ where: { id: student.id } })
          assert.equal(current.realNameNormalized, 'test revised name')
          assert.equal(current.emailNormalized, `revised-${suffix}@example.test`)
          assert.equal(
            (
              await request(http)
                .patch(`/api/admin/center/users/${student.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('Idempotency-Key', key())
                .send({
                  expectedUpdatedAt: current.updatedAt.toISOString(),
                  reason: 'TEST duplicate',
                  patch: { email: admin.email },
                })
            ).status,
            409,
          )
        },
      )
      await t.test(
        'recorded user activity contains real posts/comments/likes and never fabricates browsing',
        async () => {
          const post = await prisma.post.create({
            data: {
              organizationId: org,
              tournamentId: tournament.id,
              authorUserId: student.id,
              title: 'FICTIONAL_TEST Activity',
              body: 'TEST',
              status: 'PUBLISHED',
            },
          })
          await prisma.postComment.create({
            data: {
              organizationId: org,
              postId: post.id,
              userId: student.id,
              body: 'TEST comment',
            },
          })
          await prisma.postLike.create({
            data: { organizationId: org, postId: post.id, userId: student.id },
          })
          const result = await adminGet(`/admin/center/users/${student.id}/activity`)
          assert.equal(result.status, 200)
          for (const action of ['LOGIN', 'POST_CREATED', 'COMMENT_CREATED', 'CURRENT_LIKE'])
            assert.ok(result.body.items.some((r: { action: string }) => r.action === action))
          assert.ok(result.body.coverage.includes('不补造'))
        },
      )
      await t.test(
        'freeze and ban revoke real sessions, prevent protected operations and can be restored',
        async () => {
          for (const action of ['FREEZE', 'BAN', 'RESTORE']) {
            const member = await prisma.organizationMembership.findUniqueOrThrow({
              where: { organizationId_userId: { organizationId: org, userId: student.id } },
            })
            const r = await request(http)
              .post(`/api/admin/center/users/${student.id}/sanctions`)
              .set('Authorization', `Bearer ${adminToken}`)
              .set('Idempotency-Key', key())
              .send({
                action,
                expectedUpdatedAt: member.updatedAt.toISOString(),
                reason: `TEST ${action}`,
              })
            assert.equal(r.status, 201)
            if (action !== 'RESTORE') {
              assert.equal(
                (
                  await request(http)
                    .get('/api/auth/me')
                    .set('Authorization', `Bearer ${userToken}`)
                ).status,
                401,
              )
              assert.equal(
                (
                  await request(http)
                    .post('/api/auth/login')
                    .set('x-organization-id', org)
                    .send({ username: `gov-student-${suffix}`, password })
                ).status,
                401,
              )
            }
          }
          userToken = await login('student')
          assert.equal(
            (await request(http).get('/api/auth/me').set('Authorization', `Bearer ${userToken}`))
              .status,
            200,
          )
          const member = await prisma.organizationMembership.findUniqueOrThrow({
            where: { organizationId_userId: { organizationId: org, userId: admin.id } },
          })
          assert.equal(
            (
              await request(http)
                .post(`/api/admin/center/users/${admin.id}/sanctions`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('Idempotency-Key', key())
                .send({
                  action: 'BAN',
                  expectedUpdatedAt: member.updatedAt.toISOString(),
                  reason: 'TEST self protection',
                })
            ).status,
            403,
          )
        },
      )
      let postId = '',
        imageUrl = ''
      await t.test(
        'post with uploaded image stays private as draft and only becomes public after approval',
        async () => {
          const buffer = await sharp({
            create: { width: 80, height: 80, channels: 3, background: '#d04545' },
          })
            .png()
            .toBuffer()
          const r = await request(http)
            .post('/api/admin/center/posts')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Idempotency-Key', key())
            .send({
              tournamentId: tournament.id,
              title: 'FICTIONAL_TEST Photo Review',
              body: 'TEST uploaded image',
              type: 'COMMUNITY',
              status: 'DRAFT',
              imageDataUrls: [`data:image/png;base64,${buffer.toString('base64')}`],
              reason: 'TEST draft',
            })
          assert.equal(r.status, 200)
          postId = r.body.id
          imageUrl = r.body.imageUrl
          assert.equal(
            (
              await request(http)
                .get('/api/public/posts/' + postId)
                .set('x-organization-id', org)
                .set('Authorization', `Bearer ${userToken}`)
            ).status,
            404,
          )
          assert.equal((await request(http).get(imageUrl)).status, 404)
          const preview = await adminGet(
            '/admin/center/media/preview?url=' + encodeURIComponent(imageUrl),
          )
          assert.equal(preview.status, 200)
          assert.ok(String(preview.headers['content-type']).includes('image/webp'))
          const decision = await request(http)
            .post(`/api/admin/center/posts/${postId}/decisions`)
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Idempotency-Key', key())
            .send({
              action: 'APPROVE',
              expectedUpdatedAt: r.body.updatedAt,
              reason: 'TEST approved',
            })
          assert.equal(decision.status, 201)
          assert.equal(
            (
              await request(http)
                .get('/api/public/posts/' + postId)
                .set('x-organization-id', org)
                .set('Authorization', `Bearer ${userToken}`)
            ).status,
            200,
          )
          const publicImage = await request(http).get(imageUrl)
          assert.equal(publicImage.status, 200)
          assert.equal(publicImage.headers['cache-control'], 'private, max-age=600')
        },
      )
      await t.test(
        'image blocking removes public references, denies original URL, retains admin preview and restores safely',
        async () => {
          const command = {
            action: 'BLOCK',
            url: imageUrl,
            expectedVersion: 0,
            reason: 'TEST bad image',
          }
          const idempotency = key()
          const result = await request(http)
            .post('/api/admin/center/media/decisions')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Idempotency-Key', idempotency)
            .send(command)
          assert.equal(result.status, 201)
          assert.equal((await request(http).get(imageUrl)).status, 404)
          assert.equal(
            (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).imageUrl,
            null,
          )
          assert.equal(
            (await adminGet('/admin/center/media/preview?url=' + encodeURIComponent(imageUrl)))
              .status,
            200,
          )
          assert.equal(
            (
              await request(http)
                .post('/api/admin/center/media/decisions')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('Idempotency-Key', idempotency)
                .send(command)
            ).status,
            201,
          )
          assert.equal(
            (
              await request(http)
                .post('/api/admin/center/media/decisions')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('Idempotency-Key', key())
                .send(command)
            ).status,
            409,
          )
          const sameState = await request(http)
            .post('/api/admin/center/media/decisions')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Idempotency-Key', key())
            .send({ ...command, expectedVersion: 1 })
          assert.equal(sameState.status, 201)
          assert.equal(sameState.body.alreadyHandled, true)
          const restore = await request(http)
            .post('/api/admin/center/media/decisions')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Idempotency-Key', key())
            .send({ action: 'RESTORE', url: imageUrl, expectedVersion: 1, reason: 'TEST restore' })
          assert.equal(restore.status, 201)
          assert.equal((await request(http).get(imageUrl)).status, 200)
        },
      )
      await t.test(
        'AI adapter exchanges real image bytes with a simulated gateway and never auto-blocks',
        async () => {
          const previousUrl = process.env.ADMIN_AI_MODERATION_URL
          const previousKey = process.env.ADMIN_AI_MODERATION_KEY
          let payload: { protocol?: string; images?: string[]; text?: string } = {}
          let responseBody: unknown = {
            decision: 'BLOCK',
            summary: 'FICTIONAL_TEST suggested block',
          }
          const gateway = createServer(async (req, res) => {
            const chunks: Buffer[] = []
            for await (const chunk of req) chunks.push(Buffer.from(chunk as Buffer))
            payload = JSON.parse(Buffer.concat(chunks).toString())
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(responseBody))
          })
          await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve))
          process.env.ADMIN_AI_MODERATION_URL = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`
          delete process.env.ADMIN_AI_MODERATION_KEY
          try {
            const result = await request(http)
              .post(`/api/admin/center/posts/${postId}/ai-review`)
              .set('Authorization', `Bearer ${adminToken}`)
              .send({ reason: 'TEST simulated gateway protocol' })
            assert.equal(result.status, 201)
            assert.equal(result.body.decision, 'BLOCK')
            assert.equal(result.body.automaticAction, false)
            assert.equal(payload.protocol, 'xiaoqiu-moderation-v1')
            assert.match(payload.images?.[0] ?? '', /^data:image\/webp;base64,/)
            assert.ok(payload.text)
            assert.equal(
              (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).status,
              'PUBLISHED',
            )
            responseBody = { decision: 'INVALID', summary: '' }
            assert.equal(
              (
                await request(http)
                  .post(`/api/admin/center/posts/${postId}/ai-review`)
                  .set('Authorization', `Bearer ${adminToken}`)
                  .send({ reason: 'TEST invalid provider response' })
              ).status,
              503,
            )
          } finally {
            if (previousUrl === undefined) delete process.env.ADMIN_AI_MODERATION_URL
            else process.env.ADMIN_AI_MODERATION_URL = previousUrl
            if (previousKey === undefined) delete process.env.ADMIN_AI_MODERATION_KEY
            else process.env.ADMIN_AI_MODERATION_KEY = previousKey
            await new Promise<void>((resolve, reject) =>
              gateway.close((error) => (error ? reject(error) : resolve())),
            )
          }
        },
      )
      await t.test(
        'post sealing actually removes public content and AI not configured never claims a review',
        async () => {
          const row = await prisma.post.findUniqueOrThrow({ where: { id: postId } })
          const blocked = await request(http)
            .post(`/api/admin/center/posts/${postId}/decisions`)
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Idempotency-Key', key())
            .send({
              action: 'BLOCK',
              expectedUpdatedAt: row.updatedAt.toISOString(),
              reason: 'TEST content block',
            })
          assert.equal(blocked.status, 201)
          assert.equal(
            (
              await request(http)
                .get('/api/public/posts/' + postId)
                .set('x-organization-id', org)
                .set('Authorization', `Bearer ${userToken}`)
            ).status,
            404,
          )
          assert.equal((await request(http).get(imageUrl)).status, 404)
          assert.equal(
            (
              await request(http)
                .post(`/api/admin/center/posts/${postId}/ai-review`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'TEST AI not configured' })
            ).status,
            409,
          )
          assert.equal(
            (
              await request(http)
                .get('/api/admin/center/moderation/capabilities')
                .set('Authorization', `Bearer ${userToken}`)
            ).status,
            403,
          )
        },
      )
      await t.test(
        'six-digit password assignment is privileged, versioned, repeatable and invalidates old credentials',
        async () => {
          const url = `/api/admin/center/users/${student.id}/login-access`
          assert.equal((await request(http).get(url)).status, 401)
          assert.equal(
            (await request(http).get(url).set('Authorization', `Bearer ${userToken}`)).status,
            403,
          )
          assert.equal(
            (await adminGet(`/admin/center/users/${outside.id}/login-access`)).status,
            404,
          )
          const row = await prisma.user.findUniqueOrThrow({ where: { id: student.id } })
          const body = {
            expectedUpdatedAt: row.updatedAt.toISOString(),
            reason: 'TEST assign six digit login',
          }
          const idempotency = key()
          const assign = () =>
            request(http)
              .post(`/api/admin/center/users/${student.id}/login-password`)
              .set('Authorization', `Bearer ${adminToken}`)
              .set('Idempotency-Key', idempotency)
              .send(body)
          const assigned = await assign()
          assert.equal(assigned.status, 201)
          assert.equal(Object.hasOwn(assigned.body, 'password'), false)
          const information = await adminGet(`/admin/center/users/${student.id}/login-access`)
        assert.match(String(information.headers['cache-control']), /no-store/)
          assert.match(information.body.password, /^\d{6}$/)
          assert.equal((await assign()).status, 201)
          assert.equal(
            (await adminGet(`/admin/center/users/${student.id}/login-access`)).body.password,
            information.body.password,
          )
          assert.equal(
            (
              await request(http)
                .post('/api/auth/login')
                .set('x-organization-id', org)
                .send({
                  username: student.loginNameNormalized,
                  password: information.body.password,
                })
            ).status,
            200,
          )
          assert.equal(
            (
              await request(http)
                .post('/api/auth/login')
                .set('x-organization-id', org)
                .send({ username: student.loginNameNormalized, password })
            ).status,
            401,
          )
          assert.equal(
            (await request(http).get('/api/auth/me').set('Authorization', `Bearer ${userToken}`))
              .status,
            401,
          )
          const audit = await prisma.auditLog.findFirstOrThrow({
            where: {
              organizationId: org,
              action: 'ADMIN_LOGIN_PASSWORD_ASSIGNED',
              targetId: student.id,
            },
          })
          assert.ok((audit.afterSummary as Record<string, unknown>).encrypted)
        assert.equal(Object.hasOwn(audit.afterSummary as Record<string, unknown>, 'password'), false)
          const digest = hashPassword('FICTIONAL_User_Changed!')
          await prisma.passwordCredential.update({
            where: { userId: student.id },
            data: { passwordHash: digest.hash, passwordSalt: digest.salt },
          })
          const changed = await adminGet(`/admin/center/users/${student.id}/login-access`)
          assert.equal(changed.body.available, false)
          assert.equal(changed.body.password, null)
        },
      )
      await t.test(
        'exactly 60 unlinked player accounts receive working independent six-digit logins without admin roles',
        async () => {
          await prisma.playerProfile.createMany({
            data: Array.from({ length: 60 }, (_, index) => ({
              organizationId: org,
              displayName: `FICTIONAL_TEST ${suffix} ${index}`,
              sourceType: 'TEST',
              sourceKey: `${suffix}:${index}`,
            })),
          })
          const idempotency = key()
          const command = { count: 60, reason: 'TEST authorized sixty player logins' }
          const create = () =>
            request(http)
              .post('/api/admin/center/users/provision-from-players')
              .set('Authorization', `Bearer ${adminToken}`)
              .set('Idempotency-Key', idempotency)
              .send(command)
          const response = await create()
          assert.equal(response.status, 201)
          assert.equal(response.body.createdCount, 60)
          createdAccountIds.push(...response.body.userIds)
          assert.deepEqual((await create()).body, response.body)
          assert.equal(
            await prisma.organizationMembership.count({ where: { organizationId: org } }),
            62,
          )
          assert.equal(
            await prisma.roleAssignment.count({ where: { userId: { in: createdAccountIds } } }),
            0,
          )
          for (const id of createdAccountIds) {
            const info = await adminGet(`/admin/center/users/${id}/login-access`)
            assert.match(info.body.password, /^\d{6}$/)
            const signedIn = await request(http)
              .post('/api/auth/login')
              .set('x-organization-id', org)
              .send({ username: info.body.username, password: info.body.password })
            assert.equal(signedIn.status, 200)
          assert.ok(signedIn.body.user.linkedPlayer?.id)
            assert.deepEqual(signedIn.body.user.roles, [])
          }
        },
      )
    } finally {
      await app?.close()
      if (org && otherOrg) {
        const where = { organizationId: { in: [org, otherOrg] } }
        await prisma.idempotencyRecord.deleteMany({ where })
        await prisma.auditLog.deleteMany({ where })
        await prisma.postLike.deleteMany({ where })
        await prisma.postComment.deleteMany({ where })
        await prisma.post.deleteMany({ where })
        await prisma.userSession.deleteMany({ where })
        await prisma.roleAssignment.deleteMany({ where })
        await prisma.organizationMembership.deleteMany({ where })
        await prisma.tournament.deleteMany({ where })
        await prisma.season.deleteMany({ where })
        await prisma.user.deleteMany({
          where: {
            OR: [
              { loginNameNormalized: { startsWith: 'gov-', endsWith: suffix } },
              { id: { in: createdAccountIds } },
            ],
          },
        })
        await prisma.playerProfile.deleteMany({ where })
        await prisma.organization.deleteMany({ where: { id: { in: [org, otherOrg] } } })
      }
      await prisma.$disconnect()
      if (previousStorage === undefined) delete process.env.POST_MEDIA_DIRECTORY
      else process.env.POST_MEDIA_DIRECTORY = previousStorage
      if (previousPasswordKey === undefined) delete process.env.ADMIN_PASSWORD_KEY_FILE
      else process.env.ADMIN_PASSWORD_KEY_FILE = previousPasswordKey
      if (resolve(storage).startsWith(runtime + sep))
        await rm(storage, { recursive: true, force: true })
      else {
        process.exitCode = 1
        process.emitWarning('Unsafe test storage cleanup refused; files preserved')
      }
    }
  },
)
