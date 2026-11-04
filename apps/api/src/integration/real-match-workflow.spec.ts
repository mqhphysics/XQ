import 'reflect-metadata'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { hashPassword } from '../auth/password'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient, type Role, type RoleScopeType } from '../generated/prisma/client'
import type { ReportFieldsDto, WriteMatchReportDto } from '../match-report/match-report.dto'
import type { RosterWorkflowCommandDto } from '../roster/roster-workflow.dto'

function disposableDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL
  assert.ok(value, 'Real match workflow requires TEST_DATABASE_URL; it never silently skips')
  const parsed = new URL(value)
  assert.ok(['postgresql:', 'postgres:'].includes(parsed.protocol))
  const database = decodeURIComponent(parsed.pathname.slice(1))
  assert.match(database, /(?:^|_)(?:test|ci)(?:_|$)/, 'Use a disposable test or CI database')
  if (process.env.DATABASE_URL) {
    const daily = new URL(process.env.DATABASE_URL)
    assert.ok(
      parsed.hostname.toLowerCase() !== daily.hostname.toLowerCase() ||
        (parsed.port || '5432') !== (daily.port || '5432') ||
        database !== decodeURIComponent(daily.pathname.slice(1)),
      'TEST_DATABASE_URL must identify a different database from the application',
    )
  }
  return value
}

type RoleInput = { role: Role; scopeType: RoleScopeType; scopeId: string }
type Notice = { type: string; body: string | null; linkPath: string | null }

test(
  'FICTIONAL_TEST: real captain roster, tournament admin review, reporter confirmation, public correction and void result',
  { timeout: 120_000 },
  async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: disposableDatabaseUrl() } } })
    let app: INestApplication | undefined
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const password = 'FICTIONAL-Workflow-2026!'
    const digest = hashPassword(password)
    try {
      // Fixture provisioning only. Every business transition below uses the real AppModule HTTP API.
      const organization = await prisma.organization.create({
        data: { slug: `workflow-test-${suffix}`, name: 'FICTIONAL_TEST 完整比赛组织' },
      })
      const foreignOrganization = await prisma.organization.create({
        data: { slug: `workflow-foreign-${suffix}`, name: 'FICTIONAL_TEST 其他组织' },
      })
      const season = await prisma.season.create({
        data: {
          organizationId: organization.id,
          seasonCode: `TEST-${suffix}`,
          name: 'FICTIONAL_TEST 非演示赛季',
        },
      })
      const tournament = await prisma.tournament.create({
        data: {
          organizationId: organization.id,
          seasonId: season.id,
          tournamentCode: `TEST-WORKFLOW-${suffix}`,
          name: 'FICTIONAL_TEST 完整比赛赛事',
          status: 'PUBLISHED',
        },
      })
      const stage = await prisma.stage.create({
        data: {
          organizationId: organization.id,
          tournamentId: tournament.id,
          stageCode: 'FICTIONAL_TEST_GROUP',
          name: 'FICTIONAL_TEST 小组阶段',
          type: 'GROUP',
        },
      })
      const group = await prisma.tournamentGroup.create({
        data: {
          organizationId: organization.id,
          stageId: stage.id,
          groupCode: 'FICTIONAL_TEST_A',
          name: 'FICTIONAL_TEST A组',
        },
      })
      const teams = await Promise.all(
        ['home', 'away'].map((side) =>
          prisma.team.create({
            data: {
              organizationId: organization.id,
              teamCode: `TEST-${suffix}-${side}`,
              name: `FICTIONAL_TEST ${side}球队`,
              shortName: `TEST ${side}`,
            },
          }),
        ),
      )
      const home = teams[0]!,
        away = teams[1]!
      for (const team of teams) {
        await prisma.teamRegistration.create({
          data: {
            organizationId: organization.id,
            tournamentId: tournament.id,
            teamId: team.id,
            groupId: group.id,
          },
        })
      }
      const players = await Promise.all(
        teams.map((team, side) =>
          Promise.all(
            Array.from({ length: 8 }, (_, index) =>
              prisma.playerProfile.create({
                data: {
                  organizationId: organization.id,
                  sourceType: 'FICTIONAL_TEST',
                  sourceKey: createHash('sha256')
                    .update(`${suffix}:${side}:${index}`)
                    .digest('hex'),
                  displayName: `FICTIONAL_TEST ${side}-${index}球员`,
                  studentId: `PRIVATE_${suffix}_${side}_${index}`,
                  position: index === 0 ? 'GOALKEEPER' : index < 4 ? 'DEFENDER' : 'FORWARD',
                },
              }),
            ),
          ),
        ),
      )
      const homePlayers = players[0]!,
        awayPlayers = players[1]!
      await prisma.teamMembership.createMany({
        data: teams.flatMap((team, side) =>
          players[side]!.map((player) => ({
            organizationId: organization.id,
            teamId: team.id,
            playerProfileId: player.id,
            status: 'ACTIVE' as const,
          })),
        ),
      })
      // The custom 5/2/1 points make accidentally retaining the old 3/1/0 reader observable.
      const rule = await prisma.competitionRuleVersion.create({
        data: {
          organizationId: organization.id,
          tournamentId: tournament.id,
          version: 1,
          name: 'FICTIONAL_TEST 八人制与自定义积分规程',
          rules: {
            roster: {
              playersOnPitch: 8,
              minPlayers: 8,
              maxPlayers: 8,
              submissionDeadline: '2099-01-01T00:00:00Z',
              eligiblePlayerIds: players.flat().map((player) => player.id),
            },
            results: {
              points: { win: 5, draw: 2, loss: 1 },
              tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
              headToHead: { criteria: ['POINTS'], reapplyToRemainingTeams: false },
              groupShootout: 'REJECT',
              knockoutShootout: 'ALLOWED',
              forfeit: { winnerGoals: 3, loserGoals: 0, loserPoints: -1, both: null },
            },
          },
        },
      })
      const match = await prisma.match.create({
        data: {
          organizationId: organization.id,
          tournamentId: tournament.id,
          stageId: stage.id,
          groupId: group.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          matchCode: `TEST-MATCH-${suffix}`,
          title: 'FICTIONAL_TEST 主队对客队',
          status: 'SCHEDULED',
          scheduledStartAt: new Date('2026-10-01T10:00:00Z'),
        },
      })
      // Pre-existing upstream appearance facts exercise retention and exclusion after VOID.
      // This does not claim that the report API creates appearances or validates starting lineups.
      await prisma.matchAppearance.createMany({
        data: teams.flatMap((team, side) =>
          players[side]!.map((player, index) => ({
            organizationId: organization.id,
            matchId: match.id,
            teamId: team.id,
            playerId: player.id,
            shirtNumber: String(index + 1),
            starter: true,
            minutesPlayed: 80,
          })),
        ),
      })
      const user = async (label: string, orgId: string, role?: RoleInput) =>
        prisma.user.create({
          data: {
            loginNameNormalized: `workflow-${suffix}-${label}`,
            displayName: `FICTIONAL_TEST ${label}`,
            passwordCredential: {
              create: {
                passwordHash: digest.hash,
                passwordSalt: digest.salt,
                algorithm: digest.algorithm,
              },
            },
            memberships: { create: { organizationId: orgId, status: 'ACTIVE' } },
            ...(role ? { roleAssignments: { create: { organizationId: orgId, ...role } } } : {}),
          },
        })
      const captainHome = await user('captain-home', organization.id, {
        role: 'TEAM_CAPTAIN',
        scopeType: 'TEAM',
        scopeId: home.id,
      })
      const captainAway = await user('captain-away', organization.id, {
        role: 'TEAM_CAPTAIN',
        scopeType: 'TEAM',
        scopeId: away.id,
      })
      const admin = await user('tournament-admin', organization.id, {
        role: 'TOURNAMENT_ADMIN',
        scopeType: 'TOURNAMENT',
        scopeId: tournament.id,
      })
      const reporter = await user('reporter', organization.id, {
        role: 'MATCH_REPORTER',
        scopeType: 'MATCH',
        scopeId: match.id,
      })
      const student = await user('student', organization.id)
      const foreign = await user('foreign-admin', foreignOrganization.id, {
        role: 'ORGANIZATION_ADMIN',
        scopeType: 'ORGANIZATION',
        scopeId: foreignOrganization.id,
      })
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile()
      app = module.createNestApplication({ logger: false })
      configureApp(app)
      await app.init()
      const server = app.getHttpServer()
      const tokens = new Map<string, string>()
      for (const account of [captainHome, captainAway, admin, reporter, student, foreign]) {
        const login = await request(server)
          .post('/api/auth/login')
          .set(
            'x-organization-id',
            account.id === foreign.id ? foreignOrganization.id : organization.id,
          )
          .send({ username: account.loginNameNormalized, password })
          .expect(200)
        tokens.set(account.id, `Bearer ${login.body.accessToken}`)
        if (account.id === admin.id)
          assert.deepEqual(
            login.body.user.roles.map((role: { role: string }) => role.role),
            ['TOURNAMENT_ADMIN'],
          )
      }
      const token = (id: string) => {
        const value = tokens.get(id)
        assert.ok(value)
        return value
      }
      const publicGet = (path: string) =>
        request(server)
          .get(path)
          .set('authorization', token(student.id))
          .set('x-organization-id', organization.id)
      const rosterPath = (teamId: string) =>
        `/api/roster/tournaments/${tournament.id}/teams/${teamId}`
      const rosterCommand = (
        actor: string,
        teamId: string,
        body: RosterWorkflowCommandDto,
        key = randomUUID(),
      ) =>
        request(server)
          .post(rosterPath(teamId) + '/commands')
          .set('authorization', token(actor))
          .set('Idempotency-Key', key)
          .send(body)
      const inbox = async (actor: string): Promise<Notice[]> =>
        (
          await request(server)
            .get('/api/me/notifications')
            .set('authorization', token(actor))
            .expect(200)
        ).body.items

      // Captain -> pure tournament administrator -> return -> captain -> approve/lock.
      await request(server).get(rosterPath(home.id)).expect(401)
      await rosterCommand(student.id, home.id, {
        action: 'SAVE',
        expectedVersion: 0,
        players: [],
      }).expect(403)
      await request(server)
        .get(rosterPath(away.id))
        .set('authorization', token(captainHome.id))
        .expect(403)
      await request(server)
        .get(rosterPath(home.id))
        .set('authorization', token(foreign.id))
        .expect(404)
      const lockRoster = async (
        side: number,
        captainId: string,
        returnOnce: boolean,
      ): Promise<string> => {
        const team = teams[side]!
        const entries = players[side]!.map((player, index) => ({
          playerId: player.id,
          shirtNumber: String(index + 1),
        }))
        let current = (
          await request(server)
            .get(rosterPath(team.id))
            .set('authorization', token(captainId))
            .expect(200)
        ).body
        const key = randomUUID()
        const save = { action: 'SAVE' as const, expectedVersion: current.version, players: entries }
        current = (await rosterCommand(captainId, team.id, save, key).expect(200)).body
        const retry = await rosterCommand(captainId, team.id, save, key).expect(200)
        assert.deepEqual(retry.body, current)
        current = (
          await rosterCommand(captainId, team.id, {
            action: 'SUBMIT',
            expectedVersion: current.version,
            players: entries,
          }).expect(200)
        ).body
        assert.equal(current.status, 'SUBMITTED')
        assert.ok(
          (await inbox(admin.id)).some(
            (item) => item.type === 'ROSTER_SUBMITTED' && item.linkPath?.includes(team.id),
          ),
        )
        if (returnOnce) {
          current = (
            await rosterCommand(admin.id, team.id, {
              action: 'RETURN',
              expectedVersion: current.version,
              reason: 'FICTIONAL_TEST 请核对号码',
            }).expect(200)
          ).body
          assert.equal(current.status, 'RETURNED')
          assert.ok(
            (await inbox(captainId)).some(
              (item) => item.type === 'ROSTER_UPDATED' && item.body?.includes('核对号码'),
            ),
          )
          current = (
            await rosterCommand(captainId, team.id, {
              action: 'SUBMIT',
              expectedVersion: current.version,
              players: entries,
            }).expect(200)
          ).body
        }
        current = (
          await rosterCommand(admin.id, team.id, {
            action: 'APPROVE',
            expectedVersion: current.version,
          }).expect(200)
        ).body
        assert.equal(current.status, 'APPROVED')
        current = (
          await rosterCommand(admin.id, team.id, {
            action: 'LOCK',
            expectedVersion: current.version,
          }).expect(200)
        ).body
        assert.equal(current.status, 'LOCKED')
        assert.ok(current.lockedSnapshot?.id)
        assert.equal(current.lockedSnapshot.players.length, 8)
        await rosterCommand(captainId, team.id, {
          action: 'SAVE',
          expectedVersion: current.version,
          players: entries,
        }).expect(409)
        return current.lockedSnapshot.id as string
      }
      const homeSnapshotId = await lockRoster(0, captainHome.id, true)
      const awaySnapshotId = await lockRoster(1, captainAway.id, false)

      const reportPath = `/api/matches/${match.id}/report`
      const report: ReportFieldsDto = {
        homeScore: '2',
        awayScore: '1',
        homePenaltyScore: '',
        awayPenaltyScore: '',
        outcome: 'FINISHED',
        notes: 'PRIVATE_REVIEW_ONLY_审核员内部备注',
        events: [
          {
            clientEventId: 'test-home-one',
            kind: 'GOAL',
            side: 'HOME',
            minute: '15',
            addedMinute: '',
            playerId: homePlayers[0]!.id,
            relatedPlayerId: homePlayers[1]!.id,
          },
          {
            clientEventId: 'test-home-two',
            kind: 'GOAL',
            side: 'HOME',
            minute: '40',
            addedMinute: '',
            playerId: homePlayers[1]!.id,
            relatedPlayerId: '',
          },
          {
            clientEventId: 'test-away-one',
            kind: 'GOAL',
            side: 'AWAY',
            minute: '65',
            addedMinute: '',
            playerId: awayPlayers[0]!.id,
            relatedPlayerId: '',
          },
        ],
      }
      let reportVersion = 0
      const writeReport = (actor: string, command: WriteMatchReportDto) =>
        request(server).post(reportPath).set('authorization', token(actor)).send(command)
      const content = (
        action: 'SAVE' | 'SUBMIT' | 'CORRECT',
        fields: ReportFieldsDto,
        reason = 'FICTIONAL_TEST 比赛记录',
      ): WriteMatchReportDto => ({
        clientActionId: randomUUID(),
        expectedVersion: reportVersion,
        action,
        fields,
        reason,
        homeRosterSnapshotId: homeSnapshotId,
        awayRosterSnapshotId: awaySnapshotId,
        ruleVersionId: rule.id,
      })
      const confirm = (): WriteMatchReportDto => ({
        clientActionId: randomUUID(),
        expectedVersion: reportVersion,
        action: 'CONFIRM',
        reason: '',
      })
      const saveReport = async (actor: string, command: WriteMatchReportDto) => {
        const result = await writeReport(actor, command).expect(200)
        assert.equal(result.body.reportVersion, reportVersion + 1)
        reportVersion = result.body.reportVersion
        return result.body
      }
      const reads = async () => {
        const [competition, team, player, secondPlayer, matchDetail] = await Promise.all([
          publicGet(`/api/public/tournaments/${tournament.id}/competition-data`).expect(200),
          publicGet(`/api/public/teams/${home.id}/dashboard?tournamentId=${tournament.id}`).expect(
            200,
          ),
          publicGet(
            `/api/public/players/${homePlayers[0]!.id}?tournamentId=${tournament.id}`,
          ).expect(200),
          publicGet(
            `/api/public/players/${homePlayers[1]!.id}?tournamentId=${tournament.id}`,
          ).expect(200),
          publicGet(`/api/public/matches/${match.id}/experience`).expect(200),
        ])
        const encoded = JSON.stringify([
          competition.body,
          team.body,
          player.body,
          secondPlayer.body,
          matchDetail.body,
        ])
        assert.ok(!encoded.includes('PRIVATE_REVIEW_ONLY_'))
        for (const profile of players.flat()) assert.ok(!encoded.includes(profile.studentId!))
        assert.ok(!encoded.includes('studentId'))
        assert.equal(competition.body.resultsMode, 'OFFICIAL')
        assert.equal(team.body.resultsMode, 'OFFICIAL')
        assert.equal(player.body.resultsMode, 'OFFICIAL')
        assert.equal(competition.body.ruleVersionId, rule.id)
        const standings = competition.body.groups.find(
          (item: { id: string }) => item.id === group.id,
        )?.standings
        assert.ok(standings)
        const homeStanding = standings.find((row: { teamId: string }) => row.teamId === home.id)
        const awayStanding = standings.find((row: { teamId: string }) => row.teamId === away.id)
        assert.ok(homeStanding && awayStanding)
        return {
          competition: competition.body,
          team: team.body,
          player: player.body,
          secondPlayer: secondPlayer.body,
          homeStanding,
          awayStanding,
        }
      }

      // Draft/submission never changes the official facts; the administrator receives a real inbox entry.
      await request(server).get(reportPath).expect(401)
      await writeReport(student.id, content('SAVE', report)).expect(403)
      await saveReport(reporter.id, content('SAVE', report))
      await saveReport(reporter.id, content('SUBMIT', report))
      assert.ok((await inbox(admin.id)).some((item) => item.type === 'MATCH_REPORT_SUBMITTED'))
      let visible = await reads()
      assert.equal(visible.homeStanding.played, 0)
      assert.equal(visible.team.stats.played, 0)
      assert.equal(visible.player.stats.goals, 0)
      assert.equal(visible.player.stats.appearances, 0)
      assert.equal(await prisma.matchEvent.count({ where: { matchId: match.id } }), 0)
      await writeReport(reporter.id, confirm()).expect(403)
      await writeReport(admin.id, { ...confirm(), fields: report }).expect(400)
      const firstConfirmCommand = confirm()
      const firstConfirmation = await saveReport(admin.id, firstConfirmCommand)
      assert.deepEqual(
        (await writeReport(admin.id, firstConfirmCommand).expect(200)).body,
        firstConfirmation,
      )
      const firstConfirmedVersion = reportVersion
      visible = await reads()
      assert.equal(visible.homeStanding.points, 5)
      assert.equal(visible.awayStanding.points, 1)
      assert.deepEqual(visible.team.stats, {
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        goalsFor: 2,
        goalsAgainst: 1,
        points: 5,
        goalDifference: 1,
      })
      assert.equal(visible.player.stats.goals, 1)
      assert.equal(visible.player.stats.appearances, 1)
      assert.equal(visible.player.stats.minutes, 80)
      assert.equal(visible.secondPlayer.stats.goals, 1)
      assert.equal(visible.secondPlayer.stats.assists, 1)
      assert.equal(await prisma.matchEvent.count({ where: { matchId: match.id } }), 3)

      // Correction draft and resubmission preserve the LAST confirmation, not the newest draft.
      const corrected: ReportFieldsDto = {
        ...report,
        homeScore: '1',
        events: report.events.filter((event) => event.clientEventId !== 'test-home-two'),
      }
      await saveReport(admin.id, content('CORRECT', corrected, 'FICTIONAL_TEST 第二球无效'))
      let official = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
      assert.equal(official.confirmedReportVersion, firstConfirmedVersion)
      assert.equal(official.homeScore, 2)
      visible = await reads()
      assert.equal(visible.homeStanding.points, 5)
      assert.equal(visible.team.stats.goalsFor, 2)
      assert.equal(visible.secondPlayer.stats.goals, 1)
      await saveReport(reporter.id, content('SUBMIT', corrected, 'FICTIONAL_TEST 提交已核对更正'))
      visible = await reads()
      assert.equal(visible.team.stats.goalsFor, 2)
      await saveReport(admin.id, confirm())
      const correctedConfirmedVersion = reportVersion
      visible = await reads()
      assert.equal(visible.homeStanding.points, 2)
      assert.equal(visible.awayStanding.points, 2)
      assert.deepEqual(visible.team.stats, {
        played: 1,
        won: 0,
        drawn: 1,
        lost: 0,
        goalsFor: 1,
        goalsAgainst: 1,
        points: 2,
        goalDifference: 0,
      })
      assert.equal(visible.secondPlayer.stats.goals, 0)
      assert.equal(visible.secondPlayer.stats.assists, 1)
      assert.equal(await prisma.matchEvent.count({ where: { matchId: match.id } }), 2)
      const historical = await prisma.matchReportRevision.findFirstOrThrow({
        where: { matchId: match.id, version: firstConfirmedVersion },
      })
      assert.equal((historical.fields as unknown as ReportFieldsDto).homeScore, '2')

      // VOID removes ALL official statistics while preserving the immutable past and upstream appearances.
      const abandoned: ReportFieldsDto = {
        ...corrected,
        homeScore: '0',
        awayScore: '0',
        outcome: 'ABANDONED',
        events: [],
        notes: 'FICTIONAL_TEST 比赛判定作废',
      }
      await saveReport(admin.id, content('CORRECT', abandoned, 'FICTIONAL_TEST 比赛作废复核'))
      await saveReport(reporter.id, content('SUBMIT', abandoned, 'FICTIONAL_TEST 提交作废判定'))
      await saveReport(admin.id, confirm())
      official = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
      assert.equal(official.status, 'CANCELLED')
      assert.equal(official.homeScore, null)
      assert.equal(official.awayScore, null)
      assert.equal(official.confirmedReportVersion, reportVersion)
      visible = await reads()
      assert.equal(visible.homeStanding.played, 0)
      assert.equal(visible.awayStanding.points, 0)
      assert.deepEqual(visible.team.stats, {
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        goalDifference: 0,
      })
      assert.equal(visible.player.stats.appearances, 0)
      assert.equal(visible.player.stats.starts, 0)
      assert.equal(visible.player.stats.minutes, 0)
      assert.equal(visible.player.stats.goals, 0)
      assert.equal(visible.player.recentMatches.length, 0)
      assert.equal(visible.competition.leaders.scorers.length, 0)
      assert.equal(await prisma.matchAppearance.count({ where: { matchId: match.id } }), 16)
      assert.equal(await prisma.matchEvent.count({ where: { matchId: match.id } }), 0)
      const confirmations = await prisma.matchReportRevision.findMany({
        where: { matchId: match.id, status: 'CONFIRMED' },
        orderBy: { version: 'asc' },
      })
      assert.deepEqual(
        confirmations.map((revision) => revision.version),
        [firstConfirmedVersion, correctedConfirmedVersion, reportVersion],
      )
      assert.equal(
        await prisma.outboxJob.count({
          where: {
            organizationId: organization.id,
            aggregateId: match.id,
            eventType: 'MatchReportConfirmed',
          },
        }),
        3,
      )
      const history = await request(server)
        .get(reportPath + '/history')
        .set('authorization', token(reporter.id))
        .expect(200)
      assert.ok(
        history.body.items.some(
          (revision: { version: number; fields: ReportFieldsDto }) =>
            revision.version === firstConfirmedVersion && revision.fields.homeScore === '2',
        ),
      )
      for (const profile of players.flat())
        assert.ok(!JSON.stringify(history.body).includes(profile.studentId!))
      // Worker revision fencing and restart are covered by its dedicated PostgreSQL tests.
      // Retain these FICTIONAL_TEST fixtures until the owner drops the whole disposable database.
    } finally {
      await app?.close()
      await prisma.$disconnect()
    }
  },
)
