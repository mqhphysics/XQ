import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { Controller, Get, Headers, Inject, Param, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import request from 'supertest'

import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'
import { AccessPolicyService } from './access-policy.service'
import { AuthService } from './auth.service'
import { AuthorizeInApplicationService } from './application-authorization'
import { hashPassword } from './password'

@Controller('test/context')
class PolicyProbeController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessPolicyService) private readonly policy: AccessPolicyService,
  ) {}

  @Get('teams/:id')
  async team(@Headers('authorization') authorization: string, @Param('id') id: string) {
    await this.policy.requireTeamCaptain(await this.auth.requireSession(authorization), id)
    return { allowed: true }
  }

  @Get('matches/:id')
  async match(@Headers('authorization') authorization: string, @Param('id') id: string) {
    await this.policy.requireMatchReporter(await this.auth.requireSession(authorization), id)
    return { allowed: true }
  }
}

@Controller('admin')
class UnconfiguredAdminProbeController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessPolicyService) private readonly policy: AccessPolicyService,
  ) {}

  @Get('test-unconfigured-context')
  read() {
    return { allowed: true }
  }

  @Get('tournaments/:id/test-unconfigured-context')
  tournamentRead() {
    return { allowed: true }
  }

  @Get('test-delegated-context/:tournamentId')
  @AuthorizeInApplicationService()
  async delegated(
    @Headers('authorization') authorization: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    await this.policy.requireTournamentAdministrator(
      await this.auth.requireSession(authorization),
      tournamentId,
    )
    return { allowed: true }
  }
}

function testDatabaseUrl(value: string) {
  const parsed = new URL(value)
  const name = decodeURIComponent(parsed.pathname.slice(1))
  assert.match(name, /(?:^|_)(?:test|ci)(?:_|$)/)
  if (process.env.DATABASE_URL) {
    const daily = new URL(process.env.DATABASE_URL)
    assert.ok(
      parsed.hostname !== daily.hostname ||
        (parsed.port || '5432') !== (daily.port || '5432') ||
        parsed.pathname !== daily.pathname ||
        (process.env.CI === 'true' && name === 'xiaoqiu_ci'),
      'Use a disposable database distinct from DATABASE_URL',
    )
  }
  return value
}

test('auth context test refuses the ordinary application database', () => {
  assert.throws(() => testDatabaseUrl('postgresql://fictional:fictional@localhost/xiaoqiu'))
})

test(
  'real PostgreSQL and HTTP authorization and tournament context',
  {
    timeout: 90_000,
  },
  async (t) => {
    assert.ok(
      process.env.TEST_DATABASE_URL,
      'This HTTP integration requires a disposable PostgreSQL TEST_DATABASE_URL',
    )
    const prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl(process.env.TEST_DATABASE_URL!) } },
    })
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const password = 'Fictional-context-2026!'
    const digest = hashPassword(password)
    const environment = {
      NODE_ENV: process.env.NODE_ENV,
      DEFAULT_ORGANIZATION_ID: process.env.DEFAULT_ORGANIZATION_ID,
      DEFAULT_TOURNAMENT_ID: process.env.DEFAULT_TOURNAMENT_ID,
    }
    let app: INestApplication | undefined
    try {
      process.env.NODE_ENV = 'test'
      delete process.env.DEFAULT_ORGANIZATION_ID
      delete process.env.DEFAULT_TOURNAMENT_ID
      const organization = await prisma.organization.create({
        data: { slug: `context-${suffix}`, name: 'FICTIONAL_TEST 权限组织' },
      })
      const other = await prisma.organization.create({
        data: { slug: `context-other-${suffix}`, name: 'FICTIONAL_TEST 其他组织' },
      })
      const createUser = async (label: string, memberOrganizationId = organization.id) =>
        prisma.user.create({
          data: {
            loginNameNormalized: `context-${suffix}-${label}`,
            displayName: `虚构账号-${label}`,
            realName: '虚构受限实名',
            studentId: `FAKE-${suffix}-${label}`,
            email: `${label}-${suffix}@example.invalid`,
            emailNormalized: `${label}-${suffix}@example.invalid`,
            memberships: { create: { organizationId: memberOrganizationId, status: 'ACTIVE' } },
            passwordCredential: {
              create: {
                passwordHash: digest.hash,
                passwordSalt: digest.salt,
                algorithm: digest.algorithm,
              },
            },
          },
        })
      const student = await createUser('student')
      const admin = await createUser('admin')
      const scopedAdmin = await createUser('scoped-admin')
      const captain = await createUser('captain')
      const reporter = await createUser('reporter')
      const tournamentReporter = await createUser('t-report')
      await prisma.roleAssignment.create({
        data: {
          userId: admin.id,
          organizationId: organization.id,
          role: 'ORGANIZATION_ADMIN',
          scopeType: 'ORGANIZATION',
          scopeId: organization.id,
        },
      })
      const season = await prisma.season.create({
        data: {
          organizationId: organization.id,
          seasonCode: `REAL-${suffix}`,
          name: 'FICTIONAL_TEST 真实格式赛季',
          startsOn: new Date('2026-10-01'),
        },
      })
      const priorSeason = await prisma.season.create({
        data: {
          organizationId: organization.id,
          seasonCode: `PRIOR-${suffix}`,
          name: 'FICTIONAL_TEST 历史赛季',
          startsOn: new Date('2025-10-01'),
        },
      })
      const tournament = await prisma.tournament.create({
        data: {
          organizationId: organization.id,
          seasonId: season.id,
          tournamentCode: `REAL-${suffix}`,
          name: 'FICTIONAL_TEST 已发布赛事',
          status: 'PUBLISHED',
        },
      })
      const prior = await prisma.tournament.create({
        data: {
          organizationId: organization.id,
          seasonId: priorSeason.id,
          tournamentCode: `PRIOR-${suffix}`,
          name: 'FICTIONAL_TEST 历史赛事',
          status: 'PUBLISHED',
        },
      })
      const draft = await prisma.tournament.create({
        data: {
          organizationId: organization.id,
          seasonId: season.id,
          tournamentCode: `DRAFT-${suffix}`,
          name: 'FICTIONAL_TEST 未发布赛事',
        },
      })
      const otherSeason = await prisma.season.create({
        data: { organizationId: other.id, seasonCode: suffix, name: '其他赛季' },
      })
      const foreignTournament = await prisma.tournament.create({
        data: {
          organizationId: other.id,
          seasonId: otherSeason.id,
          tournamentCode: suffix,
          name: '其他赛事',
          status: 'PUBLISHED',
        },
      })
      const team = await prisma.team.create({
        data: {
          organizationId: organization.id,
          teamCode: `A-${suffix}`,
          name: 'FICTIONAL_TEST 本队',
        },
      })
      const rival = await prisma.team.create({
        data: {
          organizationId: organization.id,
          teamCode: `B-${suffix}`,
          name: 'FICTIONAL_TEST 他队',
        },
      })
      const foreignTeam = await prisma.team.create({
        data: { organizationId: other.id, teamCode: suffix, name: '其他组织球队' },
      })
      await prisma.teamRegistration.createMany({
        data: [team, rival].map((item) => ({
          organizationId: organization.id,
          tournamentId: tournament.id,
          teamId: item.id,
          status: 'APPROVED' as const,
        })),
      })
      const player = await prisma.playerProfile.create({
        data: {
          organizationId: organization.id,
          displayName: 'FICTIONAL_TEST 球员',
          studentId: `PRIVATE-${suffix}`,
        },
      })
      const match = await prisma.match.create({
        data: {
          organizationId: organization.id,
          tournamentId: tournament.id,
          matchCode: `M-${suffix}`,
          title: 'FICTIONAL_TEST 公开比赛',
          homeTeamId: team.id,
          awayTeamId: rival.id,
        },
      })
      const secondMatch = await prisma.match.create({
        data: {
          organizationId: organization.id,
          tournamentId: tournament.id,
          matchCode: `M2-${suffix}`,
          title: 'FICTIONAL_TEST 另一比赛',
        },
      })
      const draftMatch = await prisma.match.create({
        data: {
          organizationId: organization.id,
          tournamentId: tournament.id,
          matchCode: `DM-${suffix}`,
          title: 'FICTIONAL_TEST 草案比赛',
        },
      })
      const priorMatch = await prisma.match.create({
        data: {
          organizationId: organization.id,
          tournamentId: prior.id,
          matchCode: `PM-${suffix}`,
          title: 'FICTIONAL_TEST 历史比赛',
          status: 'SCHEDULED',
        },
      })
      const role = await prisma.roleAssignment.create({
        data: {
          userId: scopedAdmin.id,
          organizationId: organization.id,
          role: 'TOURNAMENT_ADMIN',
          scopeType: 'TOURNAMENT',
          scopeId: tournament.id,
        },
      })
      await prisma.roleAssignment.createMany({
        data: [
          {
            userId: captain.id,
            organizationId: organization.id,
            role: 'TEAM_CAPTAIN',
            scopeType: 'TEAM',
            scopeId: team.id,
          },
          {
            userId: reporter.id,
            organizationId: organization.id,
            role: 'MATCH_REPORTER',
            scopeType: 'MATCH',
            scopeId: match.id,
          },
          {
            userId: tournamentReporter.id,
            organizationId: organization.id,
            role: 'MATCH_REPORTER',
            scopeType: 'TOURNAMENT',
            scopeId: tournament.id,
          },
        ],
      })
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
        controllers: [PolicyProbeController, UnconfiguredAdminProbeController],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile()
      app = moduleRef.createNestApplication()
      configureApp(app)
      await app.init()
      const server = app.getHttpServer()
      const login = async (account: typeof student, memberOrganizationId = organization.id) => {
        const response = await request(server)
          .post('/api/auth/login')
          .set('x-organization-id', memberOrganizationId)
          .send({ username: account.loginNameNormalized, password })
          .expect(200)
        return `Bearer ${response.body.accessToken as string}`
      }
      const studentToken = await login(student)
      const readPublic = (path: string) =>
        request(server).get(path).set('authorization', studentToken)
      const adminToken = await login(admin)
      const scopedToken = await login(scopedAdmin)
      const captainToken = await login(captain)
      const reporterToken = await login(reporter)
      const tournamentReporterToken = await login(tournamentReporter)

      await t.test(
        'a fresh active organization has an authenticated 404 home and a 200 empty published list',
        async () => {
          const emptyOrganization = await prisma.organization.create({
            data: { slug: `context-empty-${suffix}`, name: 'FICTIONAL_TEST 空联调组织' },
          })
          const emptyUser = await createUser('empty', emptyOrganization.id)
          const token = await login(emptyUser, emptyOrganization.id)
          process.env.NODE_ENV = 'production'
          try {
            await request(server)
              .get('/api/public/home')
              .set('x-organization-id', emptyOrganization.id)
              .expect(404)
            const home = await request(server)
              .get('/api/public/home')
              .set('authorization', token)
              .expect(404)
            assert.equal(home.body.code, ERROR_CODES.NOT_FOUND)
            assert.equal(home.body.message, '当前组织没有可读取的已发布赛事')
            const tournaments = await request(server)
              .get('/api/public/tournaments')
              .set('authorization', token)
              .expect(200)
            assert.deepEqual(tournaments.body, { items: [] })
            const seasons = await request(server)
              .get('/api/public/seasons')
              .set('authorization', token)
              .expect(200)
            assert.deepEqual(seasons.body, [])
            assert.equal(
              await prisma.season.count({ where: { organizationId: emptyOrganization.id } }),
              0,
            )
            assert.equal(
              await prisma.tournament.count({ where: { organizationId: emptyOrganization.id } }),
              0,
            )
            await request(server).post('/api/auth/logout').set('authorization', token).expect(204)
          } finally {
            process.env.NODE_ENV = 'test'
          }
        },
      )

      await t.test(
        'public reads allow guests while forged headers and revoked sessions stay closed',
        async () => {
          for (const url of [
            '/api/public/seasons',
            '/api/public/home/',
            '/api/PUBLIC/search?query=fictional',
            `/api/public/tournaments/${tournament.id}/competition-data`,
            `/api/public/teams/${team.id}/dashboard`,
            `/api/public/players/${player.id}`,
            `/api/public/matches/${match.id}/experience`,
            '/api/public/posts',
          ]) {
            const guest = await request(server)
              .get(url)
              .set('x-organization-id', organization.id)
              .set('x-dev-role', 'ADMIN')
              .set('x-dev-user-id', admin.id)
            assert.notEqual(guest.status, 401)
            assert.notEqual(guest.status, 403)
          }
          const guestSeasons = await request(server)
            .get('/api/public/seasons')
            .set('x-organization-id', organization.id)
            .expect(200)
          assert.ok(Array.isArray(guestSeasons.body))
          await request(server)
            .get('/api/public/seasons')
            .set('authorization', 'Bearer fictional-forged-token')
            .set('x-organization-id', organization.id)
            .expect(401)
          const revokedToken = await login(student)
          await request(server)
            .post('/api/auth/logout')
            .set('authorization', revokedToken)
            .expect(204)
          await request(server)
            .get('/api/public/seasons')
            .set('authorization', revokedToken)
            .expect(401)
          const allowed = await readPublic('/api/public/seasons').expect(200)
          // Viewer-aware public reads stay private but may be revalidated (304) by the client.
          assert.equal(allowed.headers['cache-control'], 'private, no-cache')
          await request(server).get('/api/auth/me').expect(401)
        },
      )

      const fixturePlan = await request(server)
        .post('/api/admin/schedule-plans')
        .set('authorization', adminToken)
        .send({
          tournamentId: tournament.id,
          name: 'FICTIONAL_TEST 初始赛程',
          matchIds: [match.id, secondMatch.id],
        })
        .expect(201)
      await request(server)
        .post(`/api/admin/schedule-plans/${fixturePlan.body.id}/publish`)
        .set('authorization', adminToken)
        .expect(201)

      await t.test(
        'development headers cannot grant admin access, including legacy roster routes',
        async () => {
          for (const url of [
            '/api/admin/schedule-workbench',
            `/api/admin/tournaments/${tournament.id}/team-registrations`,
          ]) {
            await request(server)
              .get(url)
              .set('x-dev-organization-id', organization.id)
              .set('x-dev-role', 'TOURNAMENT_ADMIN')
              .expect(401)
            await request(server)
              .get(url)
              .set('authorization', studentToken)
              .set('x-dev-role', 'TOURNAMENT_ADMIN')
              .set('x-dev-user-id', admin.id)
              .expect(403)
          }
          await request(server)
            .post('/api/admin/seasons')
            .set('x-dev-organization-id', organization.id)
            .set('x-dev-role', 'TOURNAMENT_ADMIN')
            .send({ seasonCode: suffix, name: '伪造管理写入' })
            .expect(401)
          assert.equal(await prisma.season.count({ where: { organizationId: organization.id } }), 2)
          await request(server)
            .get('/api/admin/schedule-workbench/')
            .set('authorization', studentToken)
            .expect(403)
          await request(server)
            .post('/api/admin/seasons/')
            .set('authorization', studentToken)
            .send({ seasonCode: suffix, name: '禁止尾斜杠绕过' })
            .expect(403)
          await request(server)
            .post('/api/ADMIN/Seasons')
            .set('authorization', studentToken)
            .send({ seasonCode: suffix, name: '禁止大小写绕过' })
            .expect(403)
          await request(server)
            .get('/api/ADMIN/Schedule-Workbench/')
            .set('authorization', studentToken)
            .expect(403)
          await request(server)
            .post(`/api/admin/schedule-plans/${fixturePlan.body.id}/PUBLISH/`)
            .set('authorization', studentToken)
            .expect(403)
          await request(server)
            .get('/api/admin/test-unconfigured-context')
            .set('authorization', adminToken)
            .expect(403)
          await request(server)
            .get(`/api/admin/tournaments/${tournament.id}/test-unconfigured-context`)
            .set('authorization', adminToken)
            .expect(403)
          await request(server)
            .get(`/api/admin/test-delegated-context/${tournament.id}`)
            .set('authorization', studentToken)
            .expect(403)
          await request(server)
            .get(`/api/admin/test-delegated-context/${tournament.id}`)
            .set('authorization', scopedToken)
            .expect(200)
          await request(server)
            .get(`/api/admin/test-delegated-context/${prior.id}`)
            .set('authorization', scopedToken)
            .expect(403)
        },
      )

      await t.test(
        'tournament admin workbench and writes stay within tournament and organization',
        async () => {
          const workbench = await request(server)
            .get('/api/admin/schedule-workbench')
            .set('authorization', scopedToken)
            .expect(200)
          assert.deepEqual(
            workbench.body.tournaments.map((item: { id: string }) => item.id),
            [tournament.id],
          )
          assert.deepEqual(
            workbench.body.seasons.map((item: { id: string }) => item.id),
            [season.id],
          )
          assert.equal(workbench.body.teams.length, 2)
          await request(server)
            .get(`/api/admin/tournaments/${tournament.id}/team-registrations`)
            .set('authorization', scopedToken)
            .expect(200)
          await request(server)
            .get(`/api/admin/tournaments/${prior.id}/team-registrations`)
            .set('authorization', scopedToken)
            .expect(403)
          await request(server)
            .get(`/api/admin/tournaments/${foreignTournament.id}/team-registrations`)
            .set('authorization', adminToken)
            .expect(404)
          await request(server)
            .get('/api/admin/schedule-workbench')
            .set('authorization', adminToken)
            .set('x-organization-id', other.id)
            .expect(403)
          await request(server)
            .post('/api/admin/seasons')
            .set('authorization', scopedToken)
            .send({ seasonCode: suffix, name: '禁止组织级写入' })
            .expect(403)
          await request(server)
            .post(`/api/admin/tournaments/${prior.id}/teams`)
            .set('authorization', scopedToken)
            .send({ teamCode: suffix, name: '禁止他赛事写入' })
            .expect(403)
          await request(server)
            .post(`/api/admin/tournaments/${tournament.id}/rule-versions`)
            .set('authorization', scopedToken)
            .send({
              version: 1,
              name: 'FICTIONAL_TEST 规则',
              rules: {
                teamSize: 11,
                results: {
                  points: { win: 3, draw: 1, loss: 0 },
                  tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
                  headToHead: { criteria: [], reapplyToRemainingTeams: false },
                  groupShootout: 'REJECT',
                  knockoutShootout: 'ALLOWED',
                  forfeit: { winnerGoals: 3, loserGoals: 0, loserPoints: 0, both: null },
                },
              },
            })
            .expect(201)
        },
      )

      await t.test(
        'captain only operates their team and reporter only their assigned match',
        async () => {
          await request(server)
            .get(`/api/test/context/teams/${team.id}`)
            .set('authorization', captainToken)
            .expect(200)
          await request(server)
            .get(`/api/test/context/teams/${rival.id}`)
            .set('authorization', captainToken)
            .expect(403)
          await request(server)
            .get(`/api/test/context/teams/${foreignTeam.id}`)
            .set('authorization', captainToken)
            .expect(404)
          await request(server)
            .get(`/api/test/context/matches/${match.id}`)
            .set('authorization', reporterToken)
            .expect(200)
          await request(server)
            .get(`/api/test/context/matches/${secondMatch.id}`)
            .set('authorization', reporterToken)
            .expect(403)
          await request(server)
            .get('/api/test/context/matches/invalid-uuid')
            .set('authorization', reporterToken)
            .expect(400)
          await request(server)
            .get(`/api/test/context/matches/${secondMatch.id}`)
            .set('authorization', tournamentReporterToken)
            .expect(200)
          await request(server)
            .get(`/api/test/context/matches/${priorMatch.id}`)
            .set('authorization', tournamentReporterToken)
            .expect(403)
          await request(server)
            .get('/api/admin/schedule-workbench')
            .set('authorization', reporterToken)
            .expect(403)
          await request(server)
            .get('/api/admin/schedule-workbench')
            .set('authorization', captainToken)
            .expect(403)
        },
      )

      await t.test(
        'real published tournaments feed the five-entry APIs without DEMO codes or private fields',
        async () => {
          const seasons = await readPublic('/api/public/seasons')
            .set('x-organization-id', organization.id)
            .expect(200)
          assert.equal(seasons.body.length, 2)
          assert.ok(
            seasons.body.every((item: { tournamentId: string }) => item.tournamentId !== draft.id),
          )
          const home = await readPublic('/api/public/home')
            .set('x-organization-id', organization.id)
            .expect(200)
          assert.equal(home.body.tournament.id, tournament.id)
          assert.ok(
            home.body.focusMatches.every((item: { id: string }) => item.id !== draftMatch.id),
          )
          const olderHome = await readPublic('/api/public/home')
            .query({ tournamentId: prior.id })
            .set('x-organization-id', organization.id)
            .expect(200)
          assert.equal(olderHome.body.tournament.id, prior.id)
          for (const url of [
            `/api/public/tournaments/${tournament.id}/schedule`,
            `/api/public/tournaments/${tournament.id}/competition-data`,
            `/api/public/teams/${team.id}/dashboard?tournamentId=${tournament.id}`,
            `/api/public/matches/${match.id}/experience`,
            `/api/public/posts?tournamentId=${prior.id}`,
          ]) {
            const response = await readPublic(url)
              .set('x-organization-id', organization.id)
              .expect(200)
            const json = JSON.stringify(response.body)
            for (const privateValue of [student.studentId!, student.email!, player.studentId!])
              assert.ok(!json.includes(privateValue))
          }
          await readPublic(`/api/public/players/${player.id}?tournamentId=${tournament.id}`)
            .set('x-organization-id', organization.id)
            .expect(404) // No approved locked roster yet; the later search case publishes it.
          await readPublic('/api/public/search')
            .query({ query: 'FICTIONAL_TEST', tournamentId: prior.id })
            .set('x-organization-id', organization.id)
            .expect(200)
          const preferences = await request(server)
            .get('/api/me/team-preferences')
            .query({ tournamentId: tournament.id })
            .set('authorization', studentToken)
            .expect(200)
          assert.equal(preferences.body.availableTeams.length, 2)
          const identity = await request(server)
            .get('/api/auth/me')
            .set('authorization', studentToken)
            .expect(200)
          assert.equal(identity.body.studentId, student.studentId)
          assert.equal(identity.headers['cache-control'], 'private, no-store')
          await readPublic('/api/public/home').set('authorization', studentToken).expect(200)
          await readPublic('/api/public/home')
            .set('authorization', studentToken)
            .set('x-organization-id', other.id)
            .expect(403)
          for (const id of [draft.id, foreignTournament.id]) {
            await readPublic('/api/public/home')
              .query({ tournamentId: id })
              .set('x-organization-id', organization.id)
              .expect(404)
            await readPublic(`/api/public/tournaments/${id}/competition-data`)
              .set('x-organization-id', organization.id)
              .expect(404)
          }
          await readPublic(`/api/public/matches/${draftMatch.id}/experience`)
            .set('x-organization-id', organization.id)
            .expect(404)
          await readPublic('/api/public/home')
            .query({ tournamentId: 'broken-id' })
            .set('x-organization-id', organization.id)
            .expect(400)
          await readPublic('/api/public/home')
            .set('x-organization-id', organization.id)
            .set('x-dev-organization-id', other.id)
            .expect(400)
        },
      )

      await t.test(
        'search exposes organization teams while player eligibility and public matches retain tournament scope',
        async () => {
          const createPlayer = (label: string) =>
            prisma.playerProfile.create({
              data: {
                organizationId: organization.id,
                displayName: `FICTIONAL_TEST ${label}`,
                studentId: `PRIVATE-${label}-${suffix}`,
              },
            })
          const unlockedPlayer = await createPlayer('unlocked')
          const historicalPlayer = await createPlayer('historical')
          const pendingPlayer = await createPlayer('pending')
          const orphanPlayer = await createPlayer('orphan')
          const pendingTeam = await prisma.team.create({
            data: {
              organizationId: organization.id,
              teamCode: `PENDING-${suffix}`,
              name: 'FICTIONAL_TEST 待审球队',
            },
          })
          await prisma.teamRegistration.create({
            data: {
              organizationId: organization.id,
              tournamentId: tournament.id,
              teamId: pendingTeam.id,
              status: 'SUBMITTED',
            },
          })
          const snapshot = async (
            tournamentId: string,
            teamId: string,
            playerId: string,
            version: number,
            locked: boolean,
          ) => {
            const registration =
              (await prisma.teamRegistration.findFirst({
                where: { organizationId: organization.id, tournamentId, teamId },
              })) ??
              (await prisma.teamRegistration.create({
                data: { organizationId: organization.id, tournamentId, teamId, status: 'APPROVED' },
              }))
            const hash = randomUUID().replaceAll('-', '').padEnd(64, '0')
            const submission = await prisma.rosterSubmission.create({
              data: {
                organizationId: organization.id,
                teamRegistrationId: registration.id,
                submissionVersion: version,
                sourceFileHash: hash,
              },
            })
            const created = await prisma.rosterSnapshot.create({
              data: {
                organizationId: organization.id,
                tournamentId,
                teamId,
                teamRegistrationId: registration.id,
                rosterSubmissionId: submission.id,
                snapshotVersion: version,
                sourceFileHash: hash,
                entries: {
                  create: {
                    playerProfileId: playerId,
                    displayName: 'FICTIONAL_TEST 快照球员',
                    shirtNumber: String(version),
                  },
                },
              },
            })
            if (locked)
              await prisma.rosterSnapshot.update({
                where: { id: created.id },
                data: { lockedAt: new Date() },
              })
          }
          await snapshot(tournament.id, team.id, player.id, 1, true)
          await snapshot(tournament.id, team.id, player.id, 2, true)
          await snapshot(tournament.id, rival.id, unlockedPlayer.id, 1, false)
          await snapshot(prior.id, rival.id, historicalPlayer.id, 1, true)
          await snapshot(tournament.id, pendingTeam.id, pendingPlayer.id, 1, true)
          const search = await readPublic('/api/public/search')
            .query({ query: 'FICTIONAL_TEST', tournamentId: tournament.id })
            .set('x-organization-id', organization.id)
            .expect(200)
          assert.deepEqual(
            search.body.players.map((item: { id: string }) => item.id),
            [player.id],
          )
          assert.deepEqual(
            search.body.teams.map((item: { id: string }) => item.id).sort(),
            [team.id, rival.id, pendingTeam.id].sort(),
          )
          assert.deepEqual(
            search.body.matches.map((item: { id: string }) => item.id).sort(),
            [match.id, secondMatch.id].sort(),
          )
          const older = await readPublic('/api/public/search')
            .query({ query: 'FICTIONAL_TEST', tournamentId: prior.id })
            .set('x-organization-id', organization.id)
            .expect(200)
          assert.deepEqual(
            older.body.players.map((item: { id: string }) => item.id),
            [historicalPlayer.id],
          )
          assert.deepEqual(
            older.body.matches.map((item: { id: string }) => item.id),
            [priorMatch.id],
          )
          for (const hiddenId of [
            unlockedPlayer.id,
            orphanPlayer.id,
            pendingPlayer.id,
            draftMatch.id,
          ]) {
            assert.ok(!JSON.stringify(search.body).includes(hiddenId))
          }
          const detail = await readPublic(`/api/public/players/${player.id}`)
            .query({ tournamentId: tournament.id })
            .set('x-organization-id', organization.id)
            .expect(200)
          assert.equal(detail.body.shirtNumber, '2')
          const pendingDashboard = await readPublic(`/api/public/teams/${pendingTeam.id}/dashboard`)
            .query({ tournamentId: tournament.id })
            .set('x-organization-id', organization.id)
            .expect(200)
          assert.equal(pendingDashboard.body.rosterSource, 'TEAM_MEMBERSHIP')
          assert.deepEqual(pendingDashboard.body.roster, [])
          assert.equal(pendingDashboard.body.team.groupName, null)
          assert.equal(JSON.stringify(pendingDashboard.body).includes(pendingPlayer.id), false)
        },
      )

      await t.test(
        'production accepts a guest organization and preserves explicit tournament context',
        async () => {
          process.env.NODE_ENV = 'production'
          try {
            await request(server).get('/api/public/seasons').expect(400)
            process.env.DEFAULT_ORGANIZATION_ID = organization.id
            await request(server).get('/api/public/seasons').expect(200)
            delete process.env.DEFAULT_ORGANIZATION_ID
            await readPublic('/api/public/seasons').expect(200)
            await readPublic('/api/public/seasons')
              .set('x-dev-organization-id', organization.id)
              .expect(400)
            await readPublic('/api/public/seasons')
              .set('x-organization-id', organization.id)
              .expect(200)
            process.env.DEFAULT_ORGANIZATION_ID = organization.id
            process.env.DEFAULT_TOURNAMENT_ID = prior.id
            const home = await readPublic('/api/public/home').expect(200)
            assert.equal(home.body.tournament.id, prior.id)
            process.env.DEFAULT_TOURNAMENT_ID = draft.id
            await readPublic('/api/public/home').expect(404)
            const explicit = await readPublic('/api/public/home')
              .query({ tournamentId: tournament.id })
              .expect(200)
            assert.equal(explicit.body.tournament.id, tournament.id)
          } finally {
            process.env.NODE_ENV = 'test'
            delete process.env.DEFAULT_ORGANIZATION_ID
            delete process.env.DEFAULT_TOURNAMENT_ID
          }
        },
      )

      await t.test(
        'concurrent publication commits one revision, real actor audit and outbox event',
        async () => {
          const created = await request(server)
            .post('/api/admin/tournaments')
            .set('authorization', adminToken)
            .send({
              seasonId: season.id,
              tournamentCode: `HTTP-${suffix}`,
              name: 'FICTIONAL_TEST HTTP赛事',
            })
            .expect(201)
          const matchResponse = await request(server)
            .post(`/api/admin/tournaments/${created.body.id}/matches`)
            .set('authorization', adminToken)
            .send({ matchCode: `HTTP-${suffix}`, title: 'FICTIONAL_TEST HTTP比赛' })
            .expect(201)
          const plan = await request(server)
            .post('/api/admin/schedule-plans')
            .set('authorization', adminToken)
            .send({
              tournamentId: created.body.id,
              name: 'FICTIONAL_TEST HTTP草案',
              matchIds: [matchResponse.body.id],
            })
            .expect(201)
          const results = await Promise.all(
            [1, 2].map((index) =>
              request(server)
                .post(`/api/admin/schedule-plans/${plan.body.id}/publish`)
                .set('authorization', adminToken)
                .set('x-request-id', `auth-context-${suffix}-${index}`),
            ),
          )
          assert.deepEqual(results.map((item) => item.status).sort(), [201, 409])
          assert.equal(
            await prisma.scheduleRevision.count({ where: { schedulePlanId: plan.body.id } }),
            1,
          )
          const audits = await prisma.auditLog.findMany({
            where: { organizationId: organization.id, targetId: plan.body.id },
          })
          assert.equal(audits.length, 1)
          assert.equal(audits[0]!.actorUserId, admin.id)
          assert.equal(
            (audits[0]!.actorRoleSnapshot as { source: string }).source,
            'AUTHENTICATED_SESSION',
          )
          assert.equal(
            await prisma.outboxJob.count({
              where: { organizationId: organization.id, aggregateId: plan.body.id },
            }),
            1,
          )
          await request(server)
            .post(`/api/admin/schedule-plans/${plan.body.id}/publish`)
            .set('authorization', adminToken)
            .expect(409)
        },
      )

      await t.test(
        'existing live and finished results cannot be reassigned or republished by the draft endpoints',
        async () => {
          const original = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
          for (const status of ['LIVE', 'FINISHED'] as const) {
            await prisma.match.update({
              where: { id: match.id },
              data: { status, homeScore: 2, awayScore: 1 },
            })
            await request(server)
              .post('/api/admin/schedule-plans')
              .set('authorization', adminToken)
              .send({
                tournamentId: tournament.id,
                name: `FICTIONAL_TEST 禁止重排-${status}`,
                matchIds: [match.id],
              })
              .expect(409)
            const retained = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
            assert.equal(retained.status, status)
            assert.equal(retained.homeScore, 2)
            assert.equal(retained.awayScore, 1)
            assert.equal(retained.schedulePlanId, original.schedulePlanId)
            assert.equal(retained.scheduleRevisionId, original.scheduleRevisionId)
          }
          const pending = await request(server)
            .post(`/api/admin/tournaments/${tournament.id}/matches`)
            .set('authorization', adminToken)
            .send({ matchCode: `STALE-${suffix}`, title: 'FICTIONAL_TEST 旧草案比赛' })
            .expect(201)
          const stalePlan = await request(server)
            .post('/api/admin/schedule-plans')
            .set('authorization', adminToken)
            .send({
              tournamentId: tournament.id,
              name: 'FICTIONAL_TEST 旧草案',
              matchIds: [pending.body.id],
            })
            .expect(201)
          await prisma.match.update({
            where: { id: pending.body.id },
            data: { status: 'FINISHED', homeScore: 3, awayScore: 0 },
          })
          await request(server)
            .post(`/api/admin/schedule-plans/${stalePlan.body.id}/publish`)
            .set('authorization', adminToken)
            .expect(409)
          const retained = await prisma.match.findUniqueOrThrow({ where: { id: pending.body.id } })
          assert.equal(retained.status, 'FINISHED')
          assert.equal(retained.homeScore, 3)
          assert.equal(retained.awayScore, 0)
          assert.equal(
            (await prisma.schedulePlan.findUniqueOrThrow({ where: { id: stalePlan.body.id } }))
              .status,
            'DRAFT',
          )
          assert.equal(
            await prisma.scheduleRevision.count({ where: { schedulePlanId: stalePlan.body.id } }),
            0,
          )
          const scoredDraft = await prisma.match.create({
            data: {
              organizationId: organization.id,
              tournamentId: tournament.id,
              matchCode: `SCORED-${suffix}`,
              title: 'FICTIONAL_TEST 有比分草案',
              homeScore: 0,
              awayScore: 0,
            },
          })
          await request(server)
            .post('/api/admin/schedule-plans')
            .set('authorization', adminToken)
            .send({
              tournamentId: tournament.id,
              name: 'FICTIONAL_TEST 禁止覆盖比分',
              matchIds: [scoredDraft.id],
            })
            .expect(409)
          for (const protection of [
            { reportVersion: 1 },
            { reportVersion: 1, confirmedReportVersion: 1 },
          ]) {
            const protectedDraft = await prisma.match.create({
              data: {
                organizationId: organization.id,
                tournamentId: tournament.id,
                matchCode: `REPORT-DRAFT-${randomUUID()}`,
                title: 'FICTIONAL_TEST 报告绑定的空比分草案',
              },
            })
            const protectedPlan = await request(server)
              .post('/api/admin/schedule-plans')
              .set('authorization', adminToken)
              .send({
                tournamentId: tournament.id,
                name: 'FICTIONAL_TEST 报告绑定保护',
                matchIds: [protectedDraft.id],
              })
              .expect(201)
            await prisma.match.update({ where: { id: protectedDraft.id }, data: protection })
            await request(server)
              .post('/api/admin/schedule-plans')
              .set('authorization', adminToken)
              .send({
                tournamentId: tournament.id,
                name: 'FICTIONAL_TEST 不可重排',
                matchIds: [protectedDraft.id],
              })
              .expect(409)
            await request(server)
              .post(`/api/admin/schedule-plans/${protectedPlan.body.id}/publish`)
              .set('authorization', adminToken)
              .expect(409)
            assert.equal(
              await prisma.scheduleRevision.count({
                where: { schedulePlanId: protectedPlan.body.id },
              }),
              0,
            )
            const retained = await prisma.match.findUniqueOrThrow({
              where: { id: protectedDraft.id },
            })
            assert.equal(retained.status, 'DRAFT')
            assert.equal(retained.homeScore, null)
            assert.equal(retained.awayScore, null)
            assert.equal(retained.reportVersion, protection.reportVersion ?? 0)
            assert.equal(retained.confirmedReportVersion, protection.confirmedReportVersion ?? null)
          }
          await prisma.tournament.update({
            where: { id: tournament.id },
            data: { status: 'DRAFT' },
          })
          try {
            await readPublic(`/api/public/matches/${match.id}`)
              .set('x-organization-id', organization.id)
              .expect(404)
            await readPublic(`/api/public/matches/${match.id}/experience`)
              .set('x-organization-id', organization.id)
              .expect(404)
          } finally {
            await prisma.tournament.update({
              where: { id: tournament.id },
              data: { status: 'PUBLISHED' },
            })
          }
        },
      )

      await t.test(
        'concurrent draft creation reserves a match once and rolls the losing plan back',
        async () => {
          const pending = await request(server)
            .post(`/api/admin/tournaments/${tournament.id}/matches`)
            .set('authorization', adminToken)
            .send({ matchCode: `RESERVE-${suffix}`, title: 'FICTIONAL_TEST 并发排期比赛' })
            .expect(201)
          const name = `FICTIONAL_TEST 并发排期-${suffix}`
          const results = await Promise.all(
            [1, 2].map(() =>
              request(server)
                .post('/api/admin/schedule-plans')
                .set('authorization', adminToken)
                .send({ tournamentId: tournament.id, name, matchIds: [pending.body.id] }),
            ),
          )
          assert.deepEqual(results.map((response) => response.status).sort(), [201, 409])
          assert.equal(
            await prisma.schedulePlan.count({ where: { organizationId: organization.id, name } }),
            1,
          )
        },
      )

      await t.test(
        'database outbox failure rolls publication, audit and revision back together',
        async () => {
          const pendingMatch = await request(server)
            .post(`/api/admin/tournaments/${tournament.id}/matches`)
            .set('authorization', adminToken)
            .send({ matchCode: `ROLLBACK-${suffix}`, title: 'FICTIONAL_TEST 回滚比赛' })
            .expect(201)
          const plan = await request(server)
            .post('/api/admin/schedule-plans')
            .set('authorization', adminToken)
            .send({
              tournamentId: tournament.id,
              name: 'FICTIONAL_TEST 回滚草案',
              matchIds: [pendingMatch.body.id],
            })
            .expect(201)
          const triggerName = `auth_context_fail_${suffix}`
          await prisma.$executeRawUnsafe(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.aggregate_id = '${plan.body.id}' THEN RAISE EXCEPTION 'FICTIONAL_TEST outbox failure'; END IF; RETURN NEW; END; $$`)
          try {
            await prisma.$executeRawUnsafe(
              `CREATE TRIGGER ${triggerName} BEFORE INSERT ON outbox_jobs FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`,
            )
            await request(server)
              .post(`/api/admin/schedule-plans/${plan.body.id}/publish`)
              .set('authorization', adminToken)
              .expect(500)
            assert.equal(
              (await prisma.schedulePlan.findUniqueOrThrow({ where: { id: plan.body.id } })).status,
              'DRAFT',
            )
            assert.equal(
              (await prisma.match.findUniqueOrThrow({ where: { id: pendingMatch.body.id } }))
                .status,
              'DRAFT',
            )
            assert.equal(
              await prisma.scheduleRevision.count({ where: { schedulePlanId: plan.body.id } }),
              0,
            )
            assert.equal(
              await prisma.auditLog.count({
                where: { organizationId: organization.id, targetId: plan.body.id },
              }),
              0,
            )
            assert.equal(
              await prisma.outboxJob.count({
                where: { organizationId: organization.id, aggregateId: plan.body.id },
              }),
              0,
            )
          } finally {
            await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON outbox_jobs`)
            await prisma.$executeRawUnsafe(`DROP FUNCTION ${triggerName}()`)
          }
          await request(server)
            .post(`/api/admin/schedule-plans/${plan.body.id}/publish`)
            .set('authorization', adminToken)
            .expect(201)
        },
      )

      await t.test(
        'revocation, expiry, suspended membership, frozen user and disabled organization are effective immediately',
        async () => {
          await prisma.roleAssignment.update({
            where: { id: role.id },
            data: { revokedAt: new Date() },
          })
          await request(server)
            .get('/api/admin/schedule-workbench')
            .set('authorization', scopedToken)
            .expect(403)
          const me = await request(server)
            .get('/api/auth/me')
            .set('authorization', scopedToken)
            .expect(200)
          assert.equal(me.body.roles.length, 0)
          await prisma.organizationMembership.updateMany({
            where: { organizationId: organization.id, userId: captain.id },
            data: { status: 'SUSPENDED' },
          })
          await request(server)
            .get(`/api/test/context/teams/${team.id}`)
            .set('authorization', captainToken)
            .expect(401)
          await prisma.user.update({ where: { id: reporter.id }, data: { status: 'FROZEN' } })
          await request(server)
            .get(`/api/test/context/matches/${match.id}`)
            .set('authorization', reporterToken)
            .expect(401)
          await prisma.userSession.updateMany({
            where: { userId: student.id },
            data: { expiresAt: new Date(0) },
          })
          await readPublic('/api/public/home').set('authorization', studentToken).expect(401)
          await request(server).get('/api/auth/me').set('authorization', studentToken).expect(401)
          await request(server)
            .post('/api/auth/logout')
            .set('authorization', adminToken)
            .expect(204)
          await request(server)
            .get('/api/admin/schedule-workbench')
            .set('authorization', adminToken)
            .expect(401)
          const newAdminToken = await login(admin)
          await prisma.organization.update({
            where: { id: organization.id },
            data: { status: 'SUSPENDED' },
          })
          await request(server)
            .get('/api/admin/schedule-workbench')
            .set('authorization', newAdminToken)
            .expect(401)
          await readPublic('/api/public/seasons')
            .set('x-organization-id', organization.id)
            .expect(401)
        },
      )
    } finally {
      for (const [name, value] of Object.entries(environment)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
      await app?.close()
      await prisma.$disconnect()
      // Fixtures stay in the disposable test database; never delete locked shared records.
    }
  },
)
