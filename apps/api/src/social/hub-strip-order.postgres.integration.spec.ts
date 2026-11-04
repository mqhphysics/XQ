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

const configuredUrl = process.env.TEST_DATABASE_URL

test(
  'hub strip order persistence, sanitization, isolation and last-write-wins over HTTP',
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
    const schema = `hub_strip_${randomUUID().replaceAll('-', '').slice(0, 12)}`
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
      assert.equal(migration.status, 0, migration.stderr || migration.stdout)
      const org = await db.organization.create({
        data: { slug: 'fictional-hub-strip', name: 'FICTIONAL_TEST 主队条' },
      })
      const other = await db.organization.create({
        data: { slug: 'fictional-hub-strip-other', name: 'FICTIONAL_TEST 其他组织' },
      })
      const digest = hashPassword('Fictional-fixture-2026!')
      const user = await db.user.create({
        data: {
          loginNameNormalized: 'fixture-hub-student',
          displayName: 'FICTIONAL_TEST 主队条学生',
          verificationLevel: 'STUDENT_VERIFIED',
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
      const outsider = await db.user.create({
        data: {
          loginNameNormalized: 'fixture-hub-outsider',
          displayName: 'FICTIONAL_TEST 其他组织学生',
          verificationLevel: 'STUDENT_VERIFIED',
          memberships: { create: { organizationId: other.id, status: 'ACTIVE' } },
          passwordCredential: {
            create: {
              passwordHash: digest.hash,
              passwordSalt: digest.salt,
              algorithm: digest.algorithm,
            },
          },
        },
      })
      const [home, followed, extra, foreignTeam] = await Promise.all([
        db.team.create({
          data: { organizationId: org.id, teamCode: 'HUB-HOME', name: 'FICTIONAL_TEST 主队' },
        }),
        db.team.create({
          data: { organizationId: org.id, teamCode: 'HUB-FOLLOW', name: 'FICTIONAL_TEST 关注队' },
        }),
        db.team.create({
          data: { organizationId: org.id, teamCode: 'HUB-EXTRA', name: 'FICTIONAL_TEST 未关注队' },
        }),
        db.team.create({
          data: { organizationId: other.id, teamCode: 'HUB-OTHER', name: 'FICTIONAL_TEST 外组织队' },
        }),
      ])
      const [player, extraPlayer] = await Promise.all([
        db.playerProfile.create({
          data: { organizationId: org.id, displayName: 'FICTIONAL_TEST 关注球员' },
        }),
        db.playerProfile.create({
          data: { organizationId: org.id, displayName: 'FICTIONAL_TEST 未关注球员' },
        }),
      ])
      await db.userTeamPreference.createMany({
        data: [
          { organizationId: org.id, userId: user.id, teamId: home.id, isPrimary: true },
          { organizationId: org.id, userId: user.id, teamId: followed.id, isPrimary: false },
        ],
      })
      await db.userPlayerFollow.create({
        data: { organizationId: org.id, userId: user.id, playerProfileId: player.id },
      })
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(db)
        .compile()
      app = module.createNestApplication()
      configureApp(app)
      await app.init()
      const server = app.getHttpServer()
      async function login(username: string, organizationId: string) {
        const result = await request(server)
          .post('/api/auth/login')
          .set('X-Dev-Organization-Id', organizationId)
          .send({ username, password: 'Fictional-fixture-2026!' })
          .expect(200)
        return `Bearer ${result.body.accessToken}`
      }
      const token = await login('fixture-hub-student', org.id)
      const outsiderToken = await login('fixture-hub-outsider', other.id)

      const empty = await request(server)
        .get('/api/me/hub-strip-order')
        .set('Authorization', token)
        .expect(200)
      assert.deepEqual(empty.body.items, [])
      assert.equal(empty.body.version, 0)

      await request(server).get('/api/me/hub-strip-order').expect(401)

      const first = await request(server)
        .put('/api/me/hub-strip-order')
        .set('Authorization', token)
        .send({
          items: [
            { kind: 'player', id: player.id },
            { kind: 'team', id: home.id },
            { kind: 'team', id: followed.id },
            { kind: 'team', id: extra.id },
            { kind: 'team', id: foreignTeam.id },
            { kind: 'player', id: extraPlayer.id },
            { kind: 'team', id: followed.id },
          ],
        })
        .expect(200)
      assert.deepEqual(first.body.items, [
        { kind: 'player', id: player.id },
        { kind: 'team', id: followed.id },
      ])
      assert.equal(first.body.version, 1)

      const replay = await request(server)
        .put('/api/me/hub-strip-order')
        .set('Authorization', token)
        .send({
          items: [
            { kind: 'player', id: player.id },
            { kind: 'team', id: followed.id },
          ],
        })
        .expect(200)
      assert.equal(replay.body.version, 1)

      const next = await request(server)
        .put('/api/me/hub-strip-order')
        .set('Authorization', token)
        .send({
          items: [
            { kind: 'team', id: followed.id },
            { kind: 'player', id: player.id },
          ],
        })
        .expect(200)
      assert.deepEqual(next.body.items, [
        { kind: 'team', id: followed.id },
        { kind: 'player', id: player.id },
      ])
      assert.equal(next.body.version, 2)

      const stored = await request(server)
        .get('/api/me/hub-strip-order')
        .set('Authorization', token)
        .expect(200)
      assert.deepEqual(stored.body.items, next.body.items)
      assert.equal(stored.body.version, 2)

      assert.equal(
        await db.auditLog.count({
          where: {
            organizationId: org.id,
            action: 'HUB_STRIP_ORDER_UPDATED',
            actorUserId: user.id,
          },
        }),
        2,
      )

      await db.userHubStripOrder.create({
        data: {
          organizationId: other.id,
          userId: outsider.id,
          items: [{ kind: 'team', id: foreignTeam.id }],
        },
      })
      const isolated = await request(server)
        .get('/api/me/hub-strip-order')
        .set('Authorization', outsiderToken)
        .expect(200)
      assert.deepEqual(isolated.body.items, [])

      await request(server)
        .put('/api/me/hub-strip-order')
        .set('Authorization', token)
        .send({ items: [{ kind: 'coach', id: followed.id }] })
        .expect(400)

      await db.userPlayerFollow.deleteMany({ where: { userId: user.id, playerProfileId: player.id } })
      const filtered = await request(server)
        .get('/api/me/hub-strip-order')
        .set('Authorization', token)
        .expect(200)
      assert.deepEqual(filtered.body.items, [{ kind: 'team', id: followed.id }])
    } finally {
      await app?.close()
      await db.$disconnect()
      await control.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)
      await control.$disconnect()
    }
  },
)
