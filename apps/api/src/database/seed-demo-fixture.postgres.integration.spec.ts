import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaClient } from '../generated/prisma/client'
import { DEMO_ORGANIZATION_ID, DEMO_TEAMS, DEMO_PASSWORD, fixtureId } from './demo-fixture'
import { seedDemoFixture } from './seed-demo-fixture'

test(
  'fresh PostgreSQL seed is idempotent and exposes 16 entrants with 8 qualified knockout teams',
  { timeout: 120_000 },
  async () => {
    const configuredUrl = process.env.TEST_DATABASE_URL
    assert.ok(configuredUrl, 'Seed regression requires a disposable TEST_DATABASE_URL')
    const url = new URL(configuredUrl)
    assert.match(decodeURIComponent(url.pathname.slice(1)), /(?:^|_)(?:test|ci)(?:_|$)/)
    const previousDatabase = process.env.DATABASE_URL
    if (previousDatabase) {
      const daily = new URL(previousDatabase)
      assert.ok(
        url.hostname !== daily.hostname ||
          (url.port || '5432') !== (daily.port || '5432') ||
          url.pathname !== daily.pathname,
        'Seed regression must never use the application database',
      )
    }
    const schema = `seed_regression_test_${randomUUID().replaceAll('-', '')}`
    const admin = new PrismaClient({ datasources: { db: { url: configuredUrl } } })
    let prisma: PrismaClient | undefined
    let app: INestApplication | undefined
    let created = false
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
      created = true
      url.searchParams.set('schema', schema)
      process.env.DATABASE_URL = url.toString()
      const migration = spawnSync(
        process.execPath,
        [
          resolve(__dirname, '../../../node_modules/prisma/build/index.js'),
          'migrate',
          'deploy',
          '--schema',
          resolve(__dirname, '../../../../../prisma/schema.prisma'),
        ],
        { env: process.env, encoding: 'utf8', timeout: 30_000 },
      )
      assert.equal(
        migration.status,
        0,
        `Fresh migration failed: ${migration.stdout} ${migration.stderr}`,
      )
      prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } })
      await seedDemoFixture(prisma)
      const counts = (client: PrismaClient) =>
        Promise.all([
          client.teamRegistration.count(),
          client.rosterSubmission.count(),
          client.rosterSnapshot.count(),
          client.rosterSnapshotEntry.count(),
          client.teamMembership.count(),
          client.match.count(),
          client.matchEvent.count(),
          client.matchAppearance.count(),
          client.competitionRuleVersion.count(),
          client.user.count(),
          client.roleAssignment.count(),
          client.post.count(),
          client.postTag.count(),
        ])
      const firstCounts = await counts(prisma)
      const firstSnapshots = await prisma.rosterSnapshot.findMany({
        include: { entries: { orderBy: { id: 'asc' } } },
        orderBy: { id: 'asc' },
      })
      await seedDemoFixture(prisma)
      assert.deepEqual(
        await counts(prisma),
        firstCounts,
        'Repeated seed must not duplicate competition or social facts',
      )
      assert.deepEqual(
        await prisma.rosterSnapshot.findMany({
          include: { entries: { orderBy: { id: 'asc' } } },
          orderBy: { id: 'asc' },
        }),
        firstSnapshots,
        'Repeated seed must preserve immutable locked rosters',
      )

      const tournamentId = fixtureId('tournament:2026')
      const registrations = await prisma.teamRegistration.findMany({
        where: { tournamentId },
        include: { rosterSnapshots: { include: { entries: true } } },
      })
      assert.equal(registrations.length, 16)
      assert.ok(
        registrations.every(
          (item) =>
            item.status === 'APPROVED' &&
            item.groupId &&
            item.rosterSnapshots.length === 1 &&
            item.rosterSnapshots[0]!.lockedAt &&
            item.rosterSnapshots[0]!.entries.length === 14,
        ),
      )
      assert.equal(
        await prisma.teamMembership.count({
          where: { organizationId: DEMO_ORGANIZATION_ID, status: 'ACTIVE' },
        }),
        224,
      )
      assert.equal(
        await prisma.teamRegistration.count({
          where: { tournamentId: fixtureId('tournament:2025') },
        }),
        8,
      )

      const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
      app = module.createNestApplication({ logger: false })
      configureApp(app)
      await app.init()
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Organization-Id', DEMO_ORGANIZATION_ID)
        .send({ username: 'student', password: DEMO_PASSWORD })
        .expect(200)
      const authorization = `Bearer ${login.body.accessToken}`
      const home = await request(app.getHttpServer())
        .get('/api/public/home')
        .set('authorization', authorization)
        .set('X-Organization-Id', DEMO_ORGANIZATION_ID)
        .expect(200)
      assert.equal(home.body.tournament.teamCount, 16)
      assert.equal(home.body.teams.length, 16)
      assert.equal(home.body.tournament.matchCount, 32)
      const competition = await request(app.getHttpServer())
        .get(`/api/public/tournaments/${tournamentId}/competition-data`)
        .set('authorization', authorization)
        .set('X-Organization-Id', DEMO_ORGANIZATION_ID)
        .expect(200)
      const data = competition.body as {
        groups: Array<{ standings: Array<{ teamId: string; played: number; rank: number }> }>
        bracket: Array<{
          name: string
          matches: Array<{ homeTeam: { id: string } | null; awayTeam: { id: string } | null }>
        }>
        schedule: unknown[]
      }
      assert.equal(data.groups.length, 4)
      assert.ok(
        data.groups.every(
          (group) =>
            group.standings.length === 4 && group.standings.every((row) => row.played === 3),
        ),
      )
      assert.deepEqual(
        data.bracket.map((round) => round.matches.length),
        [4, 2, 2],
      )
      assert.equal(data.schedule.length, 32)
      const qualified = data.groups.flatMap((group) =>
        group.standings.filter((row) => row.rank <= 2).map((row) => row.teamId),
      )
      const quarterfinalTeams = data.bracket[0]!.matches.flatMap((match) => [
        match.homeTeam?.id,
        match.awayTeam?.id,
      ])
      assert.equal(new Set(qualified).size, 8)
      assert.deepEqual(new Set(quarterfinalTeams), new Set(qualified))
      const teamId = fixtureId(`team:${DEMO_TEAMS[15]!.code}`)
      const dashboard = await request(app.getHttpServer())
        .get(`/api/public/teams/${teamId}/dashboard?tournamentId=${tournamentId}`)
        .set('authorization', authorization)
        .set('X-Organization-Id', DEMO_ORGANIZATION_ID)
        .expect(200)
      assert.equal(dashboard.body.roster.length, 14)

      const reporter = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Organization-Id', DEMO_ORGANIZATION_ID)
        .send({ username: 'reporter', password: DEMO_PASSWORD })
        .expect(200)
      const reportMatch = await prisma.match.findFirstOrThrow({
        where: {
          tournamentId,
          status: 'SCHEDULED',
          homeTeamId: { not: null },
          awayTeamId: { not: null },
        },
      })
      const workspace = await request(app.getHttpServer())
        .get(`/api/matches/${reportMatch.id}/report`)
        .set('authorization', `Bearer ${reporter.body.accessToken}`)
        .expect(200)
      assert.deepEqual(workspace.body.blockingReasons, [])
      assert.equal(workspace.body.permissions.canEdit, true)
      assert.equal(workspace.body.permissions.canSubmit, true)
      assert.equal(workspace.body.homeTeam.players.length, 14)
      assert.equal(workspace.body.awayTeam.players.length, 14)

      // Restoring an old demo must append a rule version rather than changing frozen content.
      await prisma.teamRegistration.updateMany({
        where: {
          tournamentId,
          teamId: { in: DEMO_TEAMS.slice(8).map((team) => fixtureId(`team:${team.code}`)) },
        },
        data: { status: 'WITHDRAWN', groupId: null },
      })
      const legacyRules = {
        summary: 'Legacy eight-team demo',
        points: { win: 3, draw: 1, loss: 0 },
      }
      const legacy = await prisma.competitionRuleVersion.create({
        data: {
          organizationId: DEMO_ORGANIZATION_ID,
          tournamentId,
          version: 2,
          name: 'DEMO legacy rule',
          status: 'PUBLISHED',
          rules: legacyRules,
        },
      })
      await seedDemoFixture(prisma)
      assert.equal(
        await prisma.teamRegistration.count({
          where: { tournamentId, status: 'APPROVED', groupId: { not: null } },
        }),
        16,
        'Restoring a legacy demo must reapprove entrants rather than dropping them from community data',
      )
      assert.deepEqual(
        (await prisma.competitionRuleVersion.findUniqueOrThrow({ where: { id: legacy.id } })).rules,
        legacyRules,
      )
      assert.equal(
        (
          await prisma.competitionRuleVersion.findFirstOrThrow({
            where: { tournamentId },
            orderBy: { version: 'desc' },
          })
        ).version,
        3,
      )
      await seedDemoFixture(prisma)
      assert.equal(await prisma.competitionRuleVersion.count({ where: { tournamentId } }), 3)
    } finally {
      await app?.close()
      await prisma?.$disconnect()
      if (previousDatabase === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previousDatabase
      if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)
      await admin.$disconnect()
    }
  },
)
