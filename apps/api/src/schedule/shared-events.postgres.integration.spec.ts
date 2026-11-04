import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { PrismaService } from '../database/prisma.service'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { hashPassword } from '../auth/password'
import { SharedEventsSetupService } from './shared-events.setup.service'

test(
  'shared event setup keeps simulation data and exposes an empty real tournament without fake rules',
  { timeout: 90000 },
  async () => {
    const database = process.env.TEST_DATABASE_URL
    assert.ok(database)
    assert.match(new URL(database).pathname, /test|ci/)
    assert.notEqual(database, process.env.DATABASE_URL)
    const prisma = new PrismaService({ datasources: { db: { url: database } } })
    const suffix = randomUUID().slice(0, 8)
    const org = await prisma.organization.create({
      data: { slug: `shared-events-${suffix}`, name: 'FICTIONAL_TEST shared events' },
    })
    const hash = hashPassword('FICTIONAL-Test-2026!')
    const owner = await prisma.user.create({
      data: {
        loginNameNormalized: `events-owner-${suffix}`,
        displayName: 'FICTIONAL_TEST owner',
        memberships: { create: { organizationId: org.id, status: 'ACTIVE' } },
        roleAssignments: {
          create: {
            organizationId: org.id,
            role: 'ORGANIZATION_ADMIN',
            scopeType: 'ORGANIZATION',
            scopeId: org.id,
          },
        },
        passwordCredential: {
          create: { passwordHash: hash.hash, passwordSalt: hash.salt, algorithm: hash.algorithm },
        },
      },
    })
    const season = await prisma.season.create({
      data: { organizationId: org.id, seasonCode: '2026', name: 'OLD TEST season' },
    })
    const simulation = await prisma.tournament.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        tournamentCode: 'DEMO-GREEN-CUP-2026',
        name: 'OLD TEST simulation',
        status: 'PUBLISHED',
      },
    })
    const other = await prisma.tournament.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        tournamentCode: 'OLD-TEST',
        name: 'OLD TEST option',
        status: 'PUBLISHED',
      },
    })
    const stage = await prisma.stage.create({
      data: {
        organizationId: org.id,
        tournamentId: simulation.id,
        stageCode: 'GROUP',
        name: '小组赛',
        type: 'GROUP',
      },
    })
    for (const code of ['A', 'B', 'C', 'D']) {
      const group = await prisma.tournamentGroup.create({
        data: { organizationId: org.id, stageId: stage.id, groupCode: code, name: `${code}组` },
      })
      for (let index = 0; index < 4; index += 1) {
        const team = await prisma.team.create({
          data: {
            organizationId: org.id,
            teamCode: `${code}-${index}`,
            name: `FICTIONAL_TEST ${code}-${index}`,
          },
        })
        await prisma.teamRegistration.create({
          data: {
            organizationId: org.id,
            tournamentId: simulation.id,
            teamId: team.id,
            groupId: group.id,
            status: 'APPROVED',
          },
        })
      }
    }
    const setup = new SharedEventsSetupService(prisma)
    await assert.rejects(setup.configure(org.id, randomUUID()), /管理账号/)
    const first = await setup.configure(org.id, owner.id)
    const second = await setup.configure(org.id, owner.id)
    assert.equal(first.realTournamentId, second.realTournamentId)
    assert.equal(second.realCreated, false)
    assert.equal(second.archivedCount, 0)
    assert.equal(
      await prisma.teamRegistration.count({ where: { tournamentId: simulation.id } }),
      16,
    )
    assert.equal(
      (await prisma.tournament.findUniqueOrThrow({ where: { id: other.id } })).status,
      'ARCHIVED',
    )
    const realWhere = { tournamentId: first.realTournamentId }
    const emptyCounts = await Promise.all([
      prisma.match.count({ where: realWhere }),
      prisma.teamRegistration.count({ where: realWhere }),
      prisma.stage.count({ where: realWhere }),
      prisma.competitionRuleVersion.count({ where: realWhere }),
    ])
    assert.deepEqual(emptyCounts, [0, 0, 0, 0])
    const module = await Test.createTestingModule({ imports: [AppModule] })
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
        .set('x-organization-id', org.id)
        .send({ username: owner.loginNameNormalized, password: 'FICTIONAL-Test-2026!' })
        .expect(200)
      const token = login.body.accessToken
      const published = await request(http)
        .get('/api/public/tournaments')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
      assert.deepEqual(
        new Set(published.body.items.map((item: { name: string }) => item.name)),
        new Set(['模拟赛事', '2026计科杯']),
      )
      const empty = await request(http)
        .get(`/api/public/tournaments/${first.realTournamentId}/competition-data`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
      assert.equal(empty.body.resultsMode, 'PENDING')
      assert.deepEqual(empty.body.schedule, [])
      assert.deepEqual(empty.body.groups, [])
      assert.equal(empty.body.ruleVersionId, null)
      const dashboard = await request(http)
        .get('/api/admin/schedule-workbench')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
      assert.ok(
        dashboard.body.tournaments.some(
          (item: { id: string }) => item.id === first.realTournamentId,
        ),
      )
      assert.equal(await prisma.passwordCredential.count({ where: { userId: owner.id } }), 1)
      await prisma.teamRegistration.create({
        data: {
          organizationId: org.id,
          tournamentId: first.realTournamentId,
          teamId: (await prisma.team.findFirstOrThrow({ where: { organizationId: org.id } })).id,
        },
      })
      await request(http)
        .get(`/api/public/tournaments/${first.realTournamentId}/competition-data`)
        .set('Authorization', `Bearer ${token}`)
        .expect(422)
    } finally {
      await app.close()
      await prisma.$disconnect()
    }
  },
)
