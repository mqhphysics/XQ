import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test, { after, before } from 'node:test'

import { type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import request from 'supertest'

import { configureApp } from '../app.setup'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import { ScheduleModule } from './schedule.module'

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'
const OTHER_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000099'
const ADMIN_HEADERS = {
  authorization: 'Bearer fictional-schedule-admin',
  'x-dev-organization-id': ORGANIZATION_ID,
  'x-dev-role': 'TOURNAMENT_ADMIN',
}
const PUBLIC_HEADERS = {
  authorization: 'Bearer fictional-schedule-admin',
  'x-dev-organization-id': ORGANIZATION_ID,
}

type Row = Record<string, unknown>

class FakePrisma {
  organization = {
    findFirst: async ({ where }: { where: Row }) => ({ id: where.id }),
  }
  seasons: Row[] = []
  tournaments: Row[] = []
  ruleVersions: Row[] = []
  teams: Row[] = []
  teamRegistrations: Row[] = []
  venues: Row[] = []
  matches: Row[] = []
  schedulePlans: Row[] = []
  scheduleRevisions: Row[] = []
  auditLogs: Row[] = []
  outboxJobs: Row[] = []

  season = {
    create: async ({ data }: { data: Row }) => this.create(this.seasons, data),
    findFirst: async ({ where }: { where: Row }) => this.findFirst(this.seasons, where),
    findMany: async ({ where }: { where: Row }) =>
      this.seasons.filter((season) => this.matchesWhere(season, where)),
  }

  tournament = {
    create: async ({ data }: { data: Row }) =>
      this.create(this.tournaments, { status: 'DRAFT', ...data }),
    findFirst: async ({ include, where }: { include?: Row; where: Row }) => {
      const tournament = this.findFirst(this.tournaments, where)

      if (tournament === null || include === undefined) {
        return tournament
      }

      return {
        ...tournament,
        ruleVersions: this.ruleVersions.filter(
          (ruleVersion) => ruleVersion.tournamentId === tournament.id,
        ),
        season: this.seasons.find((season) => season.id === tournament.seasonId),
      }
    },
    findMany: async ({
      orderBy,
      where,
      include,
    }: {
      orderBy?: { createdAt?: 'asc' | 'desc' }
      where: Row
      include?: Row
    }) => {
      const tournaments = this.tournaments
        .filter((tournament) => this.matchesWhere(tournament, where))
        .map((tournament) =>
          include?._count
            ? {
                ...tournament,
                _count: {
                  scheduleRevisions: this.scheduleRevisions.filter(
                    (revision) =>
                      revision.tournamentId === tournament.id && revision.status === 'PUBLISHED',
                  ).length,
                },
              }
            : tournament,
        )
      const direction = orderBy?.createdAt
      if (direction === undefined) {
        return tournaments
      }

      return tournaments.sort((left, right) => {
        const delta = (left.createdAt as Date).getTime() - (right.createdAt as Date).getTime()
        return direction === 'asc' ? delta : -delta
      })
    },
    update: async ({ data, where }: { data: Row; where: Row }) =>
      this.updateOne(this.tournaments, where, data),
  }

  competitionRuleVersion = {
    create: async ({ data }: { data: Row }) =>
      this.create(this.ruleVersions, {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        ...data,
      }),
    findMany: async ({ where }: { where: Row }) =>
      this.ruleVersions.filter((ruleVersion) => this.matchesWhere(ruleVersion, where)),
  }

  team = {
    create: async ({ data }: { data: Row }) => this.create(this.teams, data),
    findFirst: async ({ where }: { where: Row }) => this.findFirst(this.teams, where),
    findMany: async ({ where }: { where: Row }) =>
      this.teams.filter((team) => this.matchesWhere(team, where)),
  }

  teamRegistration = {
    findFirst: async ({ include, where }: { include?: Row; where: Row }) => {
      const registration = this.findFirst(this.teamRegistrations, where)

      if (registration === null || include === undefined) {
        return registration
      }

      return {
        ...registration,
        team: this.teams.find((team) => team.id === registration.teamId),
      }
    },
  }

  venue = {
    create: async ({ data }: { data: Row }) => this.create(this.venues, data),
    findFirst: async ({ where }: { where: Row }) => this.findFirst(this.venues, where),
    findMany: async ({ where }: { where: Row }) =>
      this.venues.filter((venue) => this.matchesWhere(venue, where)),
  }

  match = {
    count: async ({ where }: { where: Row }) =>
      this.matches.filter((match) => this.matchesWhere(match, where)).length,
    create: async ({ data }: { data: Row }) => {
      const match = this.create(this.matches, {
        status: 'DRAFT',
        reportVersion: 0,
        confirmedReportVersion: null,
        schedulePlanId: null,
        scheduleRevisionId: null,
        homeScore: null,
        awayScore: null,
        homePenaltyScore: null,
        awayPenaltyScore: null,
        ...data,
      })
      return this.withMatchRelations(match)
    },
    findFirst: async ({ where }: { where: Row }) => {
      const match = this.findFirst(this.matches, where)
      return match === null ? null : this.withMatchRelations(match)
    },
    findMany: async ({ where }: { where: Row }) =>
      this.matches
        .filter((match) => this.matchesWhere(match, where))
        .map((match) => this.withMatchRelations(match)),
    updateMany: async ({ data, where }: { data: Row; where: Row }) => {
      let count = 0

      for (const match of this.matches) {
        if (this.matchesWhere(match, where)) {
          Object.assign(match, data)
          count += 1
        }
      }

      return { count }
    },
  }

  schedulePlan = {
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const rows = this.schedulePlans.filter((plan) => this.matchesWhere(plan, where))
      rows.forEach((plan) => Object.assign(plan, data))
      return { count: rows.length }
    },
    create: async ({ data }: { data: Row & { matches?: { connect: Array<{ id: string }> } } }) => {
      const matchIds = data.matches?.connect.map((match) => match.id) ?? []
      const plan = this.create(this.schedulePlans, {
        organizationId: data.organizationId,
        tournamentId: data.tournamentId,
        name: data.name,
        status: 'DRAFT',
        publishedAt: null,
      })

      for (const match of this.matches) {
        if (matchIds.includes(String(match.id))) {
          match.schedulePlanId = plan.id
        }
      }

      return plan
    },
    findFirst: async ({ include, where }: { include?: Row; where: Row }) => {
      const plan = this.findFirst(this.schedulePlans, where)

      if (plan === null || include === undefined) {
        return plan
      }

      return {
        ...plan,
        matches: this.matches
          .filter((match) => match.schedulePlanId === plan.id)
          .map((match) => this.withMatchRelations(match)),
        tournament: this.tournaments.find((tournament) => tournament.id === plan.tournamentId),
      }
    },
    findMany: async ({ include, where }: { include?: Row; where: Row }) =>
      this.schedulePlans
        .filter((plan) => this.matchesWhere(plan, where))
        .map((plan) => {
          if (include === undefined) {
            return plan
          }

          return {
            ...plan,
            matches: this.matches
              .filter((match) => match.schedulePlanId === plan.id)
              .map((match) => ({ id: match.id })),
          }
        }),
    update: async ({ data, where }: { data: Row; where: Row }) =>
      this.updateOne(this.schedulePlans, where, data),
  }

  scheduleRevision = {
    create: async ({ data }: { data: Row }) =>
      this.create(this.scheduleRevisions, {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        ...data,
      }),
    findFirst: async ({ where }: { where: Row }) => {
      const revisions = this.scheduleRevisions.filter((revision) =>
        this.matchesWhere(revision, where),
      )
      return revisions.at(-1) ?? null
    },
  }

  auditLog = {
    create: async ({ data }: { data: Row }) => this.create(this.auditLogs, data),
  }

  outboxJob = {
    create: async ({ data }: { data: Row }) => this.create(this.outboxJobs, data),
  }

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this)
  }

  private create(rows: Row[], data: Row): Row {
    const now = new Date()
    const row = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...data,
    }
    rows.push(row)
    return row
  }

  private updateOne(rows: Row[], where: Row, data: Row): Row {
    const row = this.findFirst(rows, where)
    if (row === null) {
      throw new Error('row not found')
    }
    Object.assign(row, data, { updatedAt: new Date() })
    return row
  }

  private findFirst(rows: Row[], where: Row): Row | null {
    return rows.find((row) => this.matchesWhere(row, where)) ?? null
  }

  private matchesWhere(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, expected]) => {
      if (key === 'OR' && Array.isArray(expected)) {
        return expected.some((condition) => this.matchesWhere(row, condition as Row))
      }

      if (key === 'tournament' && typeof expected === 'object' && expected !== null) {
        const tournament = this.tournaments.find((item) => item.id === row.tournamentId)
        return tournament === undefined ? false : this.matchesWhere(tournament, expected as Row)
      }

      const actual = row[key]

      if (typeof expected === 'object' && expected !== null && 'in' in expected) {
        return (expected.in as unknown[]).includes(actual)
      }

      if (typeof expected === 'object' && expected !== null && 'not' in expected) {
        return actual !== expected.not
      }

      return actual === expected
    })
  }

  private withMatchRelations(match: Row): Row {
    return {
      ...match,
      awayTeam: this.teams.find((team) => team.id === match.awayTeamId) ?? null,
      homeTeam: this.teams.find((team) => team.id === match.homeTeamId) ?? null,
      venue: this.venues.find((venue) => venue.id === match.venueId) ?? null,
    }
  }
}

const fakePrisma = new FakePrisma()
let app: INestApplication

before(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ScheduleModule],
  })
    .overrideProvider(AuthService)
    .useValue({
      requireSession: async (authorization?: string): Promise<AuthenticatedSession> => {
        const organizationId =
          authorization === 'Bearer fictional-other-admin' ? OTHER_ORGANIZATION_ID : ORGANIZATION_ID
        if (
          !['Bearer fictional-schedule-admin', 'Bearer fictional-other-admin'].includes(
            authorization ?? '',
          )
        ) {
          throw new ApiHttpException(401, {
            code: ERROR_CODES.UNAUTHORIZED,
            message: 'Test session required',
          })
        }
        return {
          organizationId,
          userId: '00000000-0000-4000-8000-000000000011',
          sessionId: 'fictional-session',
          user: {
            id: '00000000-0000-4000-8000-000000000011',
            organizationId,
            username: 'fictional-admin',
            displayName: '虚构测试管理员',
            realName: null,
            studentId: null,
            email: null,
            bio: null,
            avatarUrl: null,
            verificationLevel: 'UNVERIFIED',
            linkedPlayer: null,
            roles: [
              { role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: organizationId },
            ],
          },
        }
      },
    })
    .overrideProvider(PrismaService)
    .useValue(fakePrisma)
    .compile()

  app = moduleRef.createNestApplication()
  configureApp(app)
  await app.init()
})

after(async () => {
  await app.close()
})

test('P1 schedule slice creates and publishes a tournament schedule', async () => {
  const season = await request(app.getHttpServer())
    .post('/api/admin/seasons')
    .set(ADMIN_HEADERS)
    .send({
      seasonCode: '2026',
      name: '2026 校园杯赛季',
      startsOn: '2026-09-01',
    })
    .expect(201)

  const tournament = await request(app.getHttpServer())
    .post('/api/admin/tournaments')
    .set(ADMIN_HEADERS)
    .send({
      seasonId: season.body.id,
      tournamentCode: 'CAMPUS-CUP-2026',
      name: '2026 校园足球杯',
    })
    .expect(201)

  await request(app.getHttpServer())
    .post(`/api/admin/tournaments/${tournament.body.id}/rule-versions`)
    .set(ADMIN_HEADERS)
    .send({
      version: 1,
      name: '首版规则',
      rules: { groupTeams: 4 },
    })
    .expect(201)

  const teamA = await request(app.getHttpServer())
    .post(`/api/admin/tournaments/${tournament.body.id}/teams`)
    .set(ADMIN_HEADERS)
    .send({
      teamCode: 'TEAM-A',
      name: '数学学院',
      shortName: '数学',
    })
    .expect(201)

  const teamB = await request(app.getHttpServer())
    .post(`/api/admin/tournaments/${tournament.body.id}/teams`)
    .set(ADMIN_HEADERS)
    .send({
      teamCode: 'TEAM-B',
      name: '物理学院',
      shortName: '物理',
    })
    .expect(201)

  const venue = await request(app.getHttpServer())
    .post('/api/admin/venues')
    .set(ADMIN_HEADERS)
    .send({
      venueCode: 'FIELD-1',
      name: '东区足球场',
    })
    .expect(201)

  const match = await request(app.getHttpServer())
    .post(`/api/admin/tournaments/${tournament.body.id}/matches`)
    .set(ADMIN_HEADERS)
    .send({
      matchCode: 'M-001',
      title: '数学学院 vs 物理学院',
      homeTeamId: teamA.body.id,
      awayTeamId: teamB.body.id,
      venueId: venue.body.id,
      scheduledStartAt: '2026-10-01T09:00:00.000Z',
    })
    .expect(201)

  const plan = await request(app.getHttpServer())
    .post('/api/admin/schedule-plans')
    .set(ADMIN_HEADERS)
    .send({
      tournamentId: tournament.body.id,
      name: '首版赛程草案',
      matchIds: [match.body.id],
    })
    .expect(201)

  await request(app.getHttpServer())
    .get(`/api/public/tournaments/${tournament.body.id}/schedule`)
    .set(PUBLIC_HEADERS)
    .expect(404)

  await request(app.getHttpServer())
    .get(`/api/public/teams/${teamA.body.id}`)
    .set(PUBLIC_HEADERS)
    .expect(404)

  await request(app.getHttpServer())
    .post(`/api/admin/schedule-plans/${plan.body.id}/validate`)
    .set(ADMIN_HEADERS)
    .expect(200)

  const revision = await request(app.getHttpServer())
    .post(`/api/admin/schedule-plans/${plan.body.id}/publish`)
    .set(ADMIN_HEADERS)
    .set('x-request-id', 'publish-request-id')
    .expect(201)

  assert.equal(revision.body.version, 1)
  assert.equal(fakePrisma.auditLogs.length, 1)
  const auditLog = fakePrisma.auditLogs[0]
  if (auditLog === undefined) {
    throw new Error('audit log was not created')
  }
  assert.equal(auditLog.requestId, 'publish-request-id')
  assert.equal(fakePrisma.outboxJobs.length, 1)
  const outboxJob = fakePrisma.outboxJobs[0]
  if (outboxJob === undefined) {
    throw new Error('outbox job was not created')
  }
  assert.equal(outboxJob.eventType, 'SchedulePlanPublished')
  assert.equal(outboxJob.correlationId, 'publish-request-id')

  const originalTournament = fakePrisma.tournaments.find((item) => item.id === tournament.body.id)
  if (originalTournament === undefined) {
    throw new Error('published tournament was not persisted')
  }
  originalTournament.createdAt = new Date('2026-08-01T00:00:00.000Z')

  const latestTournamentId = randomUUID()
  fakePrisma.tournaments.push({
    ...originalTournament,
    id: latestTournamentId,
    tournamentCode: 'LATEST-PUBLISHED',
    name: '最新发布赛事',
    createdAt: new Date('2026-08-02T00:00:00.000Z'),
    updatedAt: new Date('2026-08-02T00:00:00.000Z'),
  })

  const tournaments = await request(app.getHttpServer())
    .get('/api/public/tournaments')
    .set(PUBLIC_HEADERS)
    .expect(200)
  assert.equal(tournaments.body.items.length, 2)
  assert.equal(tournaments.body.items[0].id, latestTournamentId)
  fakePrisma.tournaments.splice(
    fakePrisma.tournaments.findIndex((item) => item.id === latestTournamentId),
    1,
  )

  const schedule = await request(app.getHttpServer())
    .get(`/api/public/tournaments/${tournament.body.id}/schedule`)
    .set(PUBLIC_HEADERS)
    .expect(200)
  assert.equal(schedule.body.matches.length, 1)
  assert.equal(schedule.body.matches[0].status, 'SCHEDULED')

  const publicMatch = await request(app.getHttpServer())
    .get(`/api/public/matches/${match.body.id}`)
    .set(PUBLIC_HEADERS)
    .expect(200)
  assert.equal(publicMatch.body.homeTeam.name, '数学学院')

  fakePrisma.teamRegistrations.push({
    id: randomUUID(),
    organizationId: ORGANIZATION_ID,
    tournamentId: tournament.body.id,
    teamId: teamA.body.id,
    status: 'APPROVED',
  })

  const publicTeam = await request(app.getHttpServer())
    .get(`/api/public/teams/${teamA.body.id}`)
    .set(PUBLIC_HEADERS)
    .expect(200)
  assert.equal(publicTeam.body.teamCode, 'TEAM-A')

  const workbench = await request(app.getHttpServer())
    .get('/api/admin/schedule-workbench')
    .set(ADMIN_HEADERS)
    .expect(200)
  assert.equal(workbench.body.seasons.length, 1)
  assert.equal(workbench.body.tournaments.length, 1)
  assert.equal(workbench.body.ruleVersions.length, 1)
  assert.equal(workbench.body.teams.length, 2)
  assert.equal(workbench.body.venues.length, 1)
  assert.equal(workbench.body.matches.length, 1)
  assert.deepEqual(workbench.body.schedulePlans[0].matchIds, [match.body.id])

  const duplicatePublish = await request(app.getHttpServer())
    .post(`/api/admin/schedule-plans/${plan.body.id}/publish`)
    .set(ADMIN_HEADERS)
    .expect(409)
  assert.equal(duplicatePublish.body.code, ERROR_CODES.SCHEDULE_PLAN_ALREADY_PUBLISHED)
})

test('P1 admin endpoints reject missing role and cross-organization resource access', async () => {
  await request(app.getHttpServer())
    .post('/api/admin/seasons')
    .set('x-dev-organization-id', ORGANIZATION_ID)
    .send({
      seasonCode: 'NO-ROLE',
      name: 'No role',
    })
    .expect(401)

  const response = await request(app.getHttpServer())
    .post('/api/admin/tournaments')
    .set({
      authorization: 'Bearer fictional-other-admin',
      'x-dev-organization-id': OTHER_ORGANIZATION_ID,
      'x-dev-role': 'TOURNAMENT_ADMIN',
    })
    .send({
      seasonId: String(fakePrisma.seasons[0]?.id),
      tournamentCode: 'OTHER',
      name: 'Other org tournament',
    })
    .expect(404)

  assert.equal(response.body.code, ERROR_CODES.NOT_FOUND)
})

test('new schedule rule versions use eight-a-side without rewriting historical rules', async () => {
  const tournamentId = randomUUID()
  fakePrisma.tournaments.push({
    id: tournamentId,
    organizationId: ORGANIZATION_ID,
    status: 'DRAFT',
  })
  const path = `/api/admin/tournaments/${tournamentId}/rule-versions`
  const historicalRules = { roster: { playersOnPitch: 11 } }
  const historical = await fakePrisma.competitionRuleVersion.create({
    data: { organizationId: ORGANIZATION_ID, tournamentId, version: 1, rules: historicalRules },
  })
  const roster = {
    minPlayers: 8,
    maxPlayers: 20,
    submissionDeadline: '2027-01-01T00:00:00Z',
    eligiblePlayerIds: [],
  }
  for (const playersOnPitch of [5, 7, 11, '8', null])
    await request(app.getHttpServer())
      .post(path)
      .set(ADMIN_HEADERS)
      .send({
        version: 2,
        name: 'Eight-a-side rule',
        rules: { roster: { ...roster, playersOnPitch } },
      })
      .expect(400)
  assert.equal(fakePrisma.ruleVersions.filter((row) => row.tournamentId === tournamentId).length, 1)
  const reply = await request(app.getHttpServer())
    .post(path)
    .set(ADMIN_HEADERS)
    .send({ version: 2, name: 'Eight-a-side rule', rules: { roster } })
    .expect(201)
  assert.equal(reply.body.rules.roster.playersOnPitch, 8)
  assert.equal(Object.hasOwn(roster, 'playersOnPitch'), false)
  assert.deepEqual(historical.rules, historicalRules)
})

test('OpenAPI includes P1 schedule paths', async () => {
  const response = await request(app.getHttpServer()).get('/api/openapi.json').expect(200)

  for (const path of [
    '/api/admin/schedule-workbench',
    '/api/admin/seasons',
    '/api/admin/tournaments',
    '/api/admin/tournaments/{id}/rule-versions',
    '/api/admin/tournaments/{id}/teams',
    '/api/admin/venues',
    '/api/admin/tournaments/{id}/matches',
    '/api/admin/schedule-plans',
    '/api/admin/schedule-plans/{id}/validate',
    '/api/admin/schedule-plans/{id}/publish',
    '/api/public/tournaments',
    '/api/public/tournaments/{id}',
    '/api/public/tournaments/{id}/schedule',
    '/api/public/matches/{id}',
    '/api/public/teams/{id}',
  ]) {
    assert.ok(response.body.paths[path], `${path} missing from OpenAPI`)
  }
})
