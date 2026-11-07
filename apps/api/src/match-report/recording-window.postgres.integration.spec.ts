import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'
import { hashPassword } from '../auth/password'
import { MatchReportService } from './match-report.service'
import { TechnicalStatisticsService } from '../technical-statistics/technical-statistics.service'
import type { ReportWorkspaceResponseDto } from './match-report.dto'
import { MatchClockService } from '../schedule/match-clock.service'
import { technicalTotals, type TechnicalOperation } from '@xiaoqiu/contracts'

test(
  '0.9.0 recording HTTP windows: opening boundary, explicit completion, actual end cutoff, late unfinished matches and administrators',
  { timeout: 90000 },
  async (t) => {
    const url = process.env.TEST_DATABASE_URL!
    assert.match(new URL(url).pathname, /_test_/)
    assert.notEqual(url, process.env.DATABASE_URL)
    const db = new PrismaClient({ datasources: { db: { url } } }),
      suffix = randomUUID()
    const org = await db.organization.create({
      data: { slug: 'recording-window-' + suffix, name: 'FICTIONAL_TEST 录入窗口' },
    })
    const season = await db.season.create({
      data: { organizationId: org.id, seasonCode: suffix, name: 'FICTIONAL_TEST' },
    })
    const tournament = await db.tournament.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        tournamentCode: suffix,
        name: 'FICTIONAL_TEST',
        status: 'PUBLISHED',
      },
    })
    const stage = await db.stage.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        stageCode: 'GROUP',
        name: 'FICTIONAL_TEST',
        type: 'GROUP',
      },
    })
    await db.competitionRuleVersion.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        version: 1,
        name: 'FICTIONAL_TEST',
        status: 'PUBLISHED',
        rules: {
          match: { periods: 2, periodMinutes: 30, intervalMinutes: 10 },
          results: {
            points: { win: 3, draw: 1, loss: 0 },
            tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
            headToHead: { criteria: [], reapplyToRemainingTeams: false },
            groupShootout: 'REJECT',
            knockoutShootout: 'ALLOWED',
            forfeit: { winnerGoals: 3, loserGoals: 0, loserPoints: 0, both: null },
          },
        },
      },
    })
    const teams = await Promise.all(
      ['HOME', 'AWAY'].map((side) =>
        db.team.create({
          data: { organizationId: org.id, teamCode: side, name: 'FICTIONAL_TEST ' + side },
        }),
      ),
    )
    for (const [index, team] of teams.entries()) {
      const player = await db.playerProfile.create({
        data: { organizationId: org.id, displayName: 'FICTIONAL_TEST 球员' + index },
      })
      const registration = await db.teamRegistration.create({
        data: {
          organizationId: org.id,
          tournamentId: tournament.id,
          teamId: team.id,
          status: 'APPROVED',
        },
      })
      const submission = await db.rosterSubmission.create({
        data: {
          organizationId: org.id,
          teamRegistrationId: registration.id,
          submissionVersion: 1,
          status: 'DRAFT',
          sourceFileHash: String(index).repeat(64),
        },
      })
      const snapshot = await db.rosterSnapshot.create({
        data: {
          organizationId: org.id,
          tournamentId: tournament.id,
          teamId: team.id,
          teamRegistrationId: registration.id,
          rosterSubmissionId: submission.id,
          snapshotVersion: 1,
          sourceFileHash: String(index).repeat(64),
        },
      })
      await db.rosterSnapshotEntry.create({
        data: {
          organizationId: org.id,
          rosterSnapshotId: snapshot.id,
          playerProfileId: player.id,
          displayName: player.displayName,
          shirtNumber: '8',
          sortOrder: 0,
        },
      })
      await db.rosterSubmission.update({
        where: { id: submission.id },
        data: { status: 'LOCKED', lockedAt: new Date() },
      })
      await db.rosterSnapshot.update({ where: { id: snapshot.id }, data: { lockedAt: new Date() } })
    }
    const kickoff = new Date(Date.now() + 35 * 60000)
    const createMatch = (
      code: string,
      start: Date | null,
      status: 'SCHEDULED' | 'FINISHED' | 'DRAFT' | 'POSTPONED' | 'CANCELLED' = 'SCHEDULED',
    ) =>
      db.match.create({
        data: {
          organizationId: org.id,
          tournamentId: tournament.id,
          stageId: stage.id,
          homeTeamId: teams[0]!.id,
          awayTeamId: teams[1]!.id,
          matchCode: code,
          title: 'FICTIONAL_TEST ' + code,
          status,
          scheduledStartAt: start,
        },
      })
    const match = await createMatch('ACTUAL', kickoff)
    const legacy = await createMatch(
      'LATE-UNFINISHED',
      new Date(kickoff.getTime() - 3 * 86400000),
      'FINISHED',
    )
    const unscheduled = await createMatch('UNKNOWN', null)
    const manual = await createMatch('MANUAL-START', kickoff)
    const automatic = await createMatch('AUTO-START', kickoff)
    const inactive = await Promise.all(
      (['DRAFT', 'POSTPONED', 'CANCELLED'] as const).map((status) =>
        createMatch(status, kickoff, status),
      ),
    )
    const credential = await hashPassword('Fictional-Window-090!')
    const users = await Promise.all(
      ['reporter', 'admin', 'student'].map((label) =>
        db.user.create({
          data: {
            displayName: 'FICTIONAL_TEST ' + label,
            loginNameNormalized: label + '-' + suffix,
            memberships: { create: { organizationId: org.id, status: 'ACTIVE' } },
            passwordCredential: {
              create: { passwordHash: credential.hash, passwordSalt: credential.salt },
            },
          },
        }),
      ),
    )
    await db.roleAssignment.createMany({
      data: [
        {
          organizationId: org.id,
          userId: users[0]!.id,
          role: 'MATCH_REPORTER',
          scopeType: 'TOURNAMENT',
          scopeId: tournament.id,
        },
        {
          organizationId: org.id,
          userId: users[1]!.id,
          role: 'TOURNAMENT_ADMIN',
          scopeType: 'TOURNAMENT',
          scopeId: tournament.id,
        },
      ],
    })
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile()
    const app = module.createNestApplication({ logger: false })
    configureApp(app)
    await app.init()
    let now = kickoff.getTime() - 30 * 60000 - 1
    t.mock.method(
      app.get(MatchReportService) as unknown as { clockNow(): number },
      'clockNow',
      () => now,
    )
    t.mock.method(
      app.get(TechnicalStatisticsService) as unknown as { clockNow(): number },
      'clockNow',
      () => now,
    )
    const clockService = app.get(MatchClockService)
    clockService.onModuleDestroy()
    t.mock.method(clockService as unknown as { clockNow(): number }, 'clockNow', () => now)
    const http = request(app.getHttpServer())
    try {
      const tokens = await Promise.all(
        users.map(async (user) => {
          const login = await http
            .post('/api/auth/login')
            .set('x-organization-id', org.id)
            .send({ username: user.loginNameNormalized, password: 'Fictional-Window-090!' })
            .expect(200)
          return 'Bearer ' + login.body.accessToken
        }),
      )
      const read = async (id = match.id, who = 0) =>
        (await http.get(`/api/matches/${id}/report`).set('authorization', tokens[who]!).expect(200))
          .body
      const begin = async (id = match.id) =>
        (
          await http
            .post(`/api/matches/${id}/report/editor`)
            .set('authorization', tokens[0]!)
            .send({ clientActionId: randomUUID() })
            .expect(200)
        ).body
      const stats = async (who = 0, id = match.id) =>
        (
          await http
            .get(`/api/matches/${id}/technical-statistics?schemaVersion=2`)
            .set('authorization', tokens[who]!)
            .expect(200)
        ).body
      const operation = () => ({
        id: randomUUID(),
        kind: 'COUNT',
        teamId: teams[0]!.id,
        metric: 'PASS',
        outcome: 'SUCCESS',
        occurredAt: new Date(now).toISOString(),
      })
      const writeStats = (version: number, who = 0, id = match.id) =>
        http
          .post(`/api/matches/${id}/technical-statistics`)
          .set('authorization', tokens[who]!)
          .send({ schemaVersion: 2, expectedVersion: version, operations: [operation()] })
      const fields = {
        homeScore: '0',
        awayScore: '0',
        homePenaltyScore: '',
        awayPenaltyScore: '',
        outcome: 'FINISHED',
        events: [],
        notes: '',
      }
      const command = (
        workspace: ReportWorkspaceResponseDto,
        action: 'SAVE_SCORE' | 'COMPLETE',
      ) => ({
        clientActionId: randomUUID(),
        expectedVersion: workspace.reportVersion,
        editorToken: workspace.editorToken,
        action,
        fields,
        homeRosterSnapshotId: workspace.homeTeam.rosterSnapshotId,
        awayRosterSnapshotId: workspace.awayTeam.rosterSnapshotId,
        ruleVersionId: workspace.ruleVersionId,
        reason: '',
      })
      const early = await read()
      const manualKey = randomUUID()
      const startManual = () =>
        http
          .post(`/api/matches/${manual.id}/start`)
          .set('authorization', tokens[0]!)
          .send({ clientActionId: manualKey })
      await startManual().expect(403)
      await http
        .post(`/api/matches/${manual.id}/start`)
        .send({ clientActionId: randomUUID() })
        .expect(401)
      await http
        .post(`/api/matches/${manual.id}/start`)
        .set('authorization', tokens[2]!)
        .send({ clientActionId: randomUUID() })
        .expect(403)
      assert.equal(early.permissions.canEdit, false)
      assert.equal(early.inline.completed, false)
      assert.equal(early.permissions.canRecordTechnical, false)
      assert.equal((await stats()).canRecord, false)
      await writeStats(0).expect(403)
      await http.get(`/api/matches/${match.id}/report`).set('authorization', tokens[2]!).expect(403)
      const adminEarly = await read(match.id, 1)
      assert.equal(adminEarly.permissions.isAdministrator, true)
      assert.equal(adminEarly.permissions.canEdit, true)
      assert.equal(adminEarly.permissions.canRecordTechnical, true)
      now = kickoff.getTime() - 30 * 60000
      const manuallyStarted = (await startManual().expect(200)).body
      assert.equal(manuallyStarted.startSource, 'MANUAL')
      assert.equal(manuallyStarted.startedAt, new Date(now).toISOString())
      const manualBasis = now
      assert.equal((await read()).permissions.canEdit, true)
      assert.equal((await stats()).canRecord, true)
      const prestart = await begin()
      await http
        .post(`/api/matches/${match.id}/report`)
        .set('authorization', tokens[0]!)
        .send(command(prestart, 'COMPLETE'))
        .expect(403)
      const saved = (
        await http
          .post(`/api/matches/${match.id}/report`)
          .set('authorization', tokens[0]!)
          .send(command(prestart, 'SAVE_SCORE'))
          .expect(200)
      ).body
      assert.equal(saved.inline.completed, false)
      assert.equal(saved.inline.canStart, true)
      assert.equal(saved.officialResult.status, 'SCHEDULED')
      now = kickoff.getTime() + 10 * 60000
      assert.equal(
        (await startManual().expect(200)).body.startedAt,
        new Date(manualBasis).toISOString(),
      )
      await clockService.tick(new Date(now))
      const automaticClock = (
        await http
          .get(`/api/public/matches/${automatic.id}/clock`)
          .set('x-organization-id', org.id)
          .expect(200)
      ).body
      assert.equal(automaticClock.startSource, 'AUTO')
      assert.equal(automaticClock.startedAt, new Date(kickoff.getTime() + 5 * 60000).toISOString())
      assert.equal(automaticClock.elapsedSeconds, 300)
      const noReset = (
        await http
          .post(`/api/matches/${automatic.id}/start`)
          .set('authorization', tokens[0]!)
          .send({ clientActionId: randomUUID() })
          .expect(200)
      ).body
      assert.equal(noReset.startedAt, new Date(kickoff.getTime() + 5 * 60000).toISOString())
      assert.equal(noReset.startSource, 'AUTO')
      const automaticRow = await db.match.findUniqueOrThrow({ where: { id: automatic.id } })
      assert.equal(automaticRow.actualStartedAt, null)
      assert.equal(automaticRow.homeScore, null)
      assert.equal(automaticRow.confirmedReportVersion, null)
      const corner = { ...operation(), metric: 'CORNER', playerId: null }
      const cornerPath = `/api/matches/${automatic.id}/technical-statistics`
      await http
        .post(cornerPath)
        .set('authorization', tokens[0]!)
        .send({ schemaVersion: 2, expectedVersion: 0, operations: [corner] })
        .expect(409)
      const cornerResult = (
        await http
          .post(cornerPath)
          .set('authorization', tokens[0]!)
          .send({ schemaVersion: 3, expectedVersion: 0, operations: [corner] })
          .expect(200)
      ).body
      assert.equal(
        technicalTotals(cornerResult.operations as TechnicalOperation[], teams[0]!.id).corners,
        1,
      )
      await http
        .post(cornerPath)
        .set('authorization', tokens[0]!)
        .send({ schemaVersion: 3, expectedVersion: 0, operations: [corner] })
        .expect(200)
      await http
        .get(cornerPath + '?schemaVersion=2')
        .set('authorization', tokens[0]!)
        .expect(409)
      await http
        .post(cornerPath)
        .set('authorization', tokens[0]!)
        .send({ schemaVersion: 2, expectedVersion: 1, operations: [operation()] })
        .expect(409)
      await http
        .get(cornerPath + '?schemaVersion=3')
        .set('authorization', tokens[0]!)
        .expect(200)
      for (const fixture of inactive) {
        const workspace = await read(fixture.id)
        assert.equal(workspace.permissions.canEdit, false)
        assert.equal(workspace.inline.canStart, false)
        await http
          .post(`/api/matches/${fixture.id}/report`)
          .set('authorization', tokens[0]!)
          .send({ ...command(workspace, 'SAVE_SCORE'), action: 'SAVE', editorToken: undefined })
          .expect(403)
        await http
          .post(`/api/matches/${fixture.id}/start`)
          .set('authorization', tokens[0]!)
          .send({ clientActionId: randomUUID() })
          .expect(403)
        assert.equal((await read(fixture.id, 1)).permissions.isAdministrator, true)
      }
      const started = await begin(),
        complete = command(started, 'COMPLETE')
      const completed = (
        await http
          .post(`/api/matches/${match.id}/report`)
          .set('authorization', tokens[0]!)
          .send(complete)
          .expect(200)
      ).body
      assert.equal(completed.inline.completed, true)
      assert.equal(completed.permissions.canEdit, false)
      assert.equal(completed.permissions.canRecordTechnical, true)
      assert.equal(completed.recordingWindow.endedAt, new Date(now).toISOString())
      assert.equal(completed.recordingWindow.endedAtSource, 'ACTUAL')
      await http
        .post(`/api/matches/${match.id}/report`)
        .set('authorization', tokens[0]!)
        .send(complete)
        .expect(200)
      assert.equal(await db.matchReportRevision.count({ where: { matchId: match.id } }), 2)
      await http
        .post(`/api/matches/${match.id}/report/editor`)
        .set('authorization', tokens[0]!)
        .send({ clientActionId: randomUUID() })
        .expect(409)
      const ended = now
      now = ended + 30 * 60000 - 1
      assert.equal((await stats()).canRecord, true)
      await writeStats(0).expect(200)
      now = ended + 30 * 60000
      assert.equal((await stats()).canRecord, false)
      assert.equal((await read()).permissions.canRecordTechnical, false)
      await writeStats(1).expect(403)
      assert.equal((await stats(1)).canRecord, true)
      await writeStats(0, 1).expect(200)
      const fact = await db.match.findUniqueOrThrow({ where: { id: match.id } })
      assert.equal(fact.confirmedReportVersion, 2)
      assert.equal(fact.homeScore, 0)
      assert.equal(fact.awayScore, 0)
      assert.equal(fact.actualEndedAt?.getTime(), ended)
      const old = await read(legacy.id)
      assert.equal(old.permissions.canEdit, true)
      assert.equal(old.permissions.canRecordTechnical, false)
      assert.equal(old.recordingWindow.endedAtSource, 'ESTIMATED')
      const oldBegin = await begin(legacy.id)
      const oldSaved = (
        await http
          .post(`/api/matches/${legacy.id}/report`)
          .set('authorization', tokens[0]!)
          .send(command(oldBegin, 'SAVE_SCORE'))
          .expect(200)
      ).body
      assert.equal(oldSaved.inline.completed, false)
      assert.equal(oldSaved.permissions.canEdit, true)
      const oldComplete = await begin(legacy.id)
      const oldDone = (
        await http
          .post(`/api/matches/${legacy.id}/report`)
          .set('authorization', tokens[0]!)
          .send(command(oldComplete, 'COMPLETE'))
          .expect(200)
      ).body
      assert.equal(oldDone.inline.completed, true)
      assert.equal(oldDone.permissions.canRecordTechnical, false)
      assert.equal(oldDone.recordingWindow.endedAtSource, 'ESTIMATED')
      assert.equal(
        (await db.match.findUniqueOrThrow({ where: { id: legacy.id } })).actualEndedAt,
        null,
      )
      assert.equal((await read(unscheduled.id)).permissions.canEdit, false)
      assert.equal((await read(unscheduled.id, 1)).permissions.canEdit, true)
    } finally {
      await app.close()
      await db.$disconnect()
    }
  },
)
