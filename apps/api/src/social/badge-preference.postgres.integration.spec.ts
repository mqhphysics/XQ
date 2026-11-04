import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { hashPassword } from '../auth/password'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'
import { publicIdentity, publicIdentitySelect } from '../experience/public-identity'

const configuredUrl = process.env.TEST_DATABASE_URL

test(
  'badge preference persistence, isolation, replay, revoked identities and message permissions over HTTP',
  {
    skip: !configuredUrl,
    timeout: 60_000,
  },
  async () => {
    assert.ok(configuredUrl)
    const url = new URL(configuredUrl)
    assert.match(
      decodeURIComponent(url.pathname.slice(1)),
      /(?:^|_)(?:test|ci)(?:_|$)/,
      'Use a dedicated test database, never the daily database',
    )
    const schema = `badge_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`
    const control = new PrismaClient({ datasources: { db: { url: url.toString() } } })
    await control.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    url.searchParams.set('schema', schema)
    const db = new PrismaService({ datasources: { db: { url: url.toString() } } })
    let app: INestApplication | undefined
    try {
      const migration = spawnSync(
        process.execPath,
        [
          require.resolve('prisma/build/index.js'),
          'migrate',
          'deploy',
          '--schema',
          path.resolve(__dirname, '../../../../../prisma/schema.prisma'),
        ],
        {
          env: { ...process.env, DATABASE_URL: url.toString() },
          encoding: 'utf8',
          timeout: 30_000,
        },
      )
      assert.equal(migration.status, 0, migration.stderr)
      const org = await db.organization.create({
        data: { slug: 'fictional-badge', name: 'FICTIONAL_TEST 标志' },
      })
      const other = await db.organization.create({
        data: { slug: 'fictional-badge-other', name: 'FICTIONAL_TEST 其他组织' },
      })
      const digest = hashPassword('Fictional-fixture-2026!')
      async function account(
        name: string,
        roles: Array<'TEAM_CAPTAIN' | 'ORGANIZATION_ADMIN' | 'PLATFORM_ADMIN'> = [],
        level: 'STUDENT_VERIFIED' | 'PLAYER_CONFIRMED' = 'STUDENT_VERIFIED',
      ) {
        const user = await db.user.create({
          data: {
            loginNameNormalized: name,
            displayName: `FICTIONAL_TEST ${name}`,
            verificationLevel: level,
            memberships: { create: { organizationId: org.id, status: 'ACTIVE' } },
            passwordCredential: {
              create: {
                passwordHash: digest.hash,
                passwordSalt: digest.salt,
                algorithm: digest.algorithm,
              },
            },
          },
        })
        for (const role of roles)
          await db.roleAssignment.create({
            data: {
              userId: user.id,
              organizationId: role === 'PLATFORM_ADMIN' ? null : org.id,
              role,
              scopeType:
                role === 'PLATFORM_ADMIN'
                  ? 'PLATFORM'
                  : role === 'TEAM_CAPTAIN'
                    ? 'TEAM'
                    : 'ORGANIZATION',
              scopeId: role === 'PLATFORM_ADMIN' ? 'platform' : org.id,
            },
          })
        return user
      }
      const captain = await account('fixture-captain', ['TEAM_CAPTAIN'], 'PLAYER_CONFIRMED')
      const student = await account('fixture-student')
      const admin = await account('fixture-orgadmin', ['ORGANIZATION_ADMIN'])
      const platform = await account('fixture-platform', ['PLATFORM_ADMIN'])
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(db)
        .compile()
      app = module.createNestApplication()
      configureApp(app)
      await app.init()
      const server = app.getHttpServer()
      async function login(username: string | null) {
        assert.ok(username)
        const result = await request(server)
          .post('/api/auth/login')
          .set('X-Dev-Organization-Id', org.id)
          .send({ username, password: 'Fictional-fixture-2026!' })
          .expect(200)
        return `Bearer ${result.body.accessToken}`
      }
      const token = await login(captain.loginNameNormalized)
      const studentToken = await login(student.loginNameNormalized)
      const adminToken = await login(admin.loginNameNormalized)
      const platformToken = await login(platform.loginNameNormalized)
      const current = await request(server)
        .get('/api/me/profile-badge')
        .set('Authorization', token)
        .expect(200)
      assert.deepEqual(current.body.availableKinds, ['captain', 'player'])
      assert.equal(current.body.displayedKind, 'captain')
      const mutation = {
        preferredKind: 'player',
        version: 0,
        clientActionId: 'fixture-badge-operation-1',
      }
      const saved = await request(server)
        .put('/api/me/profile-badge')
        .set('Authorization', token)
        .send(mutation)
        .expect(200)
      assert.equal(saved.body.version, 1)
      const replay = await request(server)
        .put('/api/me/profile-badge')
        .set('Authorization', token)
        .send(mutation)
        .expect(200)
      assert.deepEqual(replay.body, saved.body)
      assert.equal(
        await db.auditLog.count({
          where: {
            organizationId: org.id,
            action: 'PROFILE_BADGE_UPDATED',
            actorUserId: captain.id,
          },
        }),
        1,
      )
      await request(server)
        .put('/api/me/profile-badge')
        .set('Authorization', token)
        .send({ ...mutation, preferredKind: 'captain' })
        .expect(409)
      await request(server)
        .put('/api/me/profile-badge')
        .set('Authorization', token)
        .send({ ...mutation, clientActionId: 'fixture-badge-stale' })
        .expect(409)
      await request(server)
        .put('/api/me/profile-badge')
        .set('Authorization', studentToken)
        .send({ preferredKind: 'operator', version: 0, clientActionId: 'fixture-badge-unearned' })
        .expect(403)

      // Another organization's stored choice cannot override this organization.
      await db.userBadgePreference.create({
        data: { organizationId: other.id, userId: captain.id, preferredKind: 'captain' },
      })
      const identity = await db.user.findUniqueOrThrow({
        where: { id: captain.id },
        select: publicIdentitySelect,
      })
      assert.equal(publicIdentity(identity, org.id).displayedBadgeKind, 'player')
      assert.equal(await db.userBadgePreference.count({ where: { userId: captain.id } }), 2)
      await request(server)
        .put('/api/me/profile-badge')
        .set('Authorization', token)
        .send({ preferredKind: 'captain', version: 1, clientActionId: 'fixture-badge-operation-2' })
        .expect(200)
      await db.roleAssignment.updateMany({
        where: { userId: captain.id, role: 'TEAM_CAPTAIN' },
        data: { revokedAt: new Date() },
      })
      const updated = await request(server)
        .get('/api/me/profile-badge')
        .set('Authorization', token)
        .expect(200)
      assert.equal(updated.body.displayedKind, 'player')

      for (const senderToken of [adminToken, token]) {
        const list = await request(server)
          .get('/api/messages/conversations')
          .set('Authorization', senderToken)
          .expect(200)
        assert.equal(list.body.canSend, true)
        await request(server)
          .post(`/api/messages/direct/${student.id}`)
          .set('Authorization', senderToken)
          .send({ clientMessageId: 'fixture-message-member', body: 'FICTIONAL_TEST 成员私聊' })
          .expect(201)
      }
      assert.equal(await db.directMessage.count(), 2)
      const allowed = await request(server)
        .get('/api/messages/conversations')
        .set('Authorization', platformToken)
        .expect(200)
      assert.equal(allowed.body.canSend, true)
      await request(server)
        .post(`/api/messages/direct/${student.id}`)
        .set('Authorization', platformToken)
        .send({ clientMessageId: 'fixture-message-platform', body: 'FICTIONAL_TEST 平台管理员' })
        .expect(201)
      assert.equal(await db.directMessage.count(), 3)
    } finally {
      await app?.close()
      await db.$disconnect()
      // Only this test's newly created schema is removed.
      await control.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)
      await control.$disconnect()
    }
  },
)
