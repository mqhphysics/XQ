import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import request from 'supertest'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../database/prisma.service'
import { configureApp } from '../app.setup'
import { AuthModule } from './auth.module'
import { hashPassword } from './password'

test(
  'test roles issue real scoped sessions only through the configured owner',
  { timeout: 90000 },
  async (t) => {
    const database = process.env.TEST_DATABASE_URL
    assert.ok(database, 'An isolated TEST_DATABASE_URL is required')
    assert.match(new URL(database).pathname, /(?:test|ci)/)
    assert.notEqual(database, process.env.DATABASE_URL)
    const prisma = new PrismaService({ datasources: { db: { url: database } } })
    const suffix = randomUUID().slice(0, 8)
    const original = {
      enabled: process.env.DEMO_ROLE_SWITCH_ENABLED,
      owner: process.env.DEMO_ROLE_SWITCH_OWNER_ID,
      organization: process.env.DEMO_FIXTURE_ORGANIZATION_ID,
    }
    const organization = await prisma.organization.create({
      data: { slug: `test-role-${suffix}`, name: 'FICTIONAL_TEST role switch' },
    })
    const digest = hashPassword('FICTIONAL-Test-2026!')
    const owner = await prisma.user.create({
      data: {
        loginNameNormalized: `test-owner-${suffix}`,
        displayName: 'FICTIONAL_TEST owner',
        memberships: { create: { organizationId: organization.id, status: 'ACTIVE' } },
        passwordCredential: {
          create: {
            passwordHash: digest.hash,
            passwordSalt: digest.salt,
            algorithm: digest.algorithm,
          },
        },
        roleAssignments: {
          create: {
            organizationId: organization.id,
            role: 'ORGANIZATION_ADMIN',
            scopeType: 'ORGANIZATION',
            scopeId: organization.id,
          },
        },
      },
    })
    const season = await prisma.season.create({
      data: { organizationId: organization.id, seasonCode: `TEST-${suffix}`, name: '2026' },
    })
    const tournament = await prisma.tournament.create({
      data: {
        organizationId: organization.id,
        seasonId: season.id,
        tournamentCode: 'DEMO-GREEN-CUP-2026',
        name: '模拟赛事',
        status: 'PUBLISHED',
      },
    })
    const team = await prisma.team.create({
      data: {
        organizationId: organization.id,
        teamCode: `TEST-${suffix}`,
        name: 'FICTIONAL_TEST team',
      },
    })
    await prisma.teamRegistration.create({
      data: {
        organizationId: organization.id,
        tournamentId: tournament.id,
        teamId: team.id,
        status: 'APPROVED',
      },
    })
    for (let index = 0; index < 3; index += 1) {
      const player = await prisma.playerProfile.create({
        data: {
          organizationId: organization.id,
          displayName: `FICTIONAL_TEST player ${index}`,
          isDemo: true,
        },
      })
      await prisma.teamMembership.create({
        data: { organizationId: organization.id, teamId: team.id, playerProfileId: player.id },
      })
    }
    process.env.DEMO_ROLE_SWITCH_ENABLED = 'true'
    process.env.DEMO_ROLE_SWITCH_OWNER_ID = owner.id
    process.env.DEMO_FIXTURE_ORGANIZATION_ID = organization.id
    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile()
    const app = module.createNestApplication()
    configureApp(app)
    await app.init()
    try {
      const http = app.getHttpServer()
      const login = await request(http)
        .post('/api/auth/login')
        .set('x-organization-id', organization.id)
        .send({ username: owner.loginNameNormalized, password: 'FICTIONAL-Test-2026!' })
        .expect(200)
      const actorToken = login.body.accessToken as string
      const switchRole = (role: string, token = actorToken) =>
        request(http)
          .post('/api/auth/test-roles/switch')
          .set('Authorization', `Bearer ${token}`)
          .send({ role })
      let ordinaryToken = ''
      await t.test(
        'anonymous callers and unsupported or injected scopes are rejected',
        async () => {
          await request(http).get('/api/auth/test-roles').expect(401)
          await switchRole('PLATFORM_ADMIN').expect(400)
          await request(http)
            .post('/api/auth/test-roles/switch')
            .set('Authorization', `Bearer ${actorToken}`)
            .send({ role: 'TEAM_CAPTAIN', scopeId: randomUUID() })
            .expect(400)
        },
      )
      await t.test(
        'ordinary identity has a real session, no privileged role and cannot control a switch',
        async () => {
          const response = await switchRole('STUDENT').expect(200)
          ordinaryToken = response.body.accessToken
          const current = await request(http)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${ordinaryToken}`)
            .expect(200)
          assert.deepEqual(current.body.roles, [])
          assert.equal(current.body.linkedPlayer, null)
          await switchRole('ADMIN', ordinaryToken).expect(403)
          assert.equal(
            await prisma.passwordCredential.count({ where: { userId: response.body.user.id } }),
            0,
          )
        },
      )
      await t.test(
        'player, captain, coach and reporter get only the actual simulation object scopes',
        async () => {
          for (const role of ['PLAYER', 'TEAM_CAPTAIN', 'TEAM_COACH', 'MATCH_REPORTER']) {
            const response = await switchRole(role).expect(200)
            const current = await request(http)
              .get('/api/auth/me')
              .set('Authorization', `Bearer ${response.body.accessToken}`)
              .expect(200)
            assert.equal(current.body.organizationId, organization.id)
            if (role === 'PLAYER') {
              assert.deepEqual(current.body.roles, [])
              assert.ok(current.body.linkedPlayer)
            } else
              assert.deepEqual(current.body.roles, [
                {
                  role,
                  scopeType: role === 'MATCH_REPORTER' ? 'TOURNAMENT' : 'TEAM',
                  scopeId: role === 'MATCH_REPORTER' ? tournament.id : team.id,
                },
              ])
          }
          const restore = await switchRole('ADMIN').expect(200)
          assert.equal(restore.body.user.id, owner.id)
          assert.ok(
            restore.body.user.roles.some(
              (role: { role: string }) => role.role === 'ORGANIZATION_ADMIN',
            ),
          )
        },
      )
      await t.test(
        'switches are audited and duplicate selections reuse the same test user',
        async () => {
          const first = await switchRole('TEAM_CAPTAIN').expect(200)
          const second = await switchRole('TEAM_CAPTAIN').expect(200)
          assert.equal(first.body.user.id, second.body.user.id)
          assert.equal(
            await prisma.roleAssignment.count({ where: { userId: first.body.user.id } }),
            1,
          )
          assert.ok(
            await prisma.auditLog.count({
              where: { actorUserId: owner.id, action: 'TEST_ROLE_SWITCHED' },
            }),
          )
        },
      )
      await t.test(
        'disabled, foreign-organization and revoked owner controls fail closed',
        async () => {
          process.env.DEMO_ROLE_SWITCH_ENABLED = 'false'
          await switchRole('TEAM_COACH').expect(403)
          process.env.DEMO_ROLE_SWITCH_ENABLED = 'true'
          process.env.DEMO_FIXTURE_ORGANIZATION_ID = randomUUID()
          await switchRole('PLAYER').expect(403)
          process.env.DEMO_FIXTURE_ORGANIZATION_ID = organization.id
          await prisma.roleAssignment.updateMany({
            where: { userId: owner.id },
            data: { revokedAt: new Date() },
          })
          await switchRole('ADMIN').expect(403)
          await request(http)
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${ordinaryToken}`)
            .expect(204)
          await request(http)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${ordinaryToken}`)
            .expect(401)
        },
      )
    } finally {
      await app.close()
      await prisma.$disconnect()
      for (const [key, value] of Object.entries({
        DEMO_ROLE_SWITCH_ENABLED: original.enabled,
        DEMO_ROLE_SWITCH_OWNER_ID: original.owner,
        DEMO_FIXTURE_ORGANIZATION_ID: original.organization,
      })) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  },
)
