import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { hashPassword } from '../auth/password'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'

function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL
  assert.ok(value, 'Confirmed lineup HTTP acceptance requires TEST_DATABASE_URL; it cannot skip')
  const target = new URL(value)
  assert.ok(['postgresql:', 'postgres:'].includes(target.protocol))
  assert.match(decodeURIComponent(target.pathname.slice(1)), /(?:^|_)(?:test|ci)(?:_|$)/)
  if (process.env.DATABASE_URL) {
    const application = new URL(process.env.DATABASE_URL)
    assert.ok(
      target.hostname !== application.hostname ||
        (target.port || '5432') !== (application.port || '5432') ||
        target.pathname !== application.pathname,
      'Use a database distinct from the running application',
    )
  }
  return value
}

test(
  'public confirmed lineup: frozen versions and roster identities, explicit publication, official appearances and events',
  { timeout: 60_000 },
  async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } })
    let app: INestApplication | undefined
    const suffix = randomUUID().slice(0, 8)
    try {
      // Provision fictional facts only. Saving, defaulting, publishing and report confirmation use HTTP.
      const org = await prisma.organization.create({
        data: { slug: `public-lineup-test-${suffix}`, name: 'FICTIONAL_TEST 公开阵容组织' },
      })
      const season = await prisma.season.create({
        data: {
          organizationId: org.id,
          seasonCode: `TEST-${suffix}`,
          name: 'FICTIONAL_TEST 赛季',
        },
      })
      const tournament = await prisma.tournament.create({
        data: {
          organizationId: org.id,
          seasonId: season.id,
          tournamentCode: `TEST-${suffix}`,
          name: 'FICTIONAL_TEST 八人制赛事',
          status: 'PUBLISHED',
        },
      })
      const stage = await prisma.stage.create({
        data: {
          organizationId: org.id,
          tournamentId: tournament.id,
          stageCode: 'TEST-GROUP',
          name: 'FICTIONAL_TEST 小组阶段',
          type: 'GROUP',
        },
      })
      const group = await prisma.tournamentGroup.create({
        data: {
          organizationId: org.id,
          stageId: stage.id,
          groupCode: 'TEST-A',
          name: 'FICTIONAL_TEST A组',
        },
      })
      const teams = await Promise.all(
        ['home', 'away'].map((side) =>
          prisma.team.create({
            data: {
              organizationId: org.id,
              teamCode: `${side}-${suffix}`,
              name: `FICTIONAL_TEST ${side}`,
            },
          }),
        ),
      )
      const home = teams[0]!,
        away = teams[1]!
      const players = await Promise.all(
        teams.map((team, side) =>
          Promise.all(
            Array.from({ length: 10 }, (_, index) =>
              prisma.playerProfile.create({
                data: {
                  organizationId: org.id,
                  sourceType: 'FICTIONAL_TEST',
                  sourceKey: `${suffix}-${side}-${index}`,
                  displayName: `FICTIONAL_TEST 当前档案${side}-${index}`,
                  studentId: `PRIVATE_STUDENT_${suffix}_${side}_${index}`,
                  position: index === 0 ? 'GOALKEEPER' : 'MIDFIELDER',
                },
              }),
            ),
          ),
        ),
      )
      await prisma.teamMembership.createMany({
        data: teams.flatMap((team, side) =>
          players[side]!.map((player) => ({
            organizationId: org.id,
            teamId: team.id,
            playerProfileId: player.id,
          })),
        ),
      })
      const registrations = await Promise.all(
        teams.map((team) =>
          prisma.teamRegistration.create({
            data: {
              organizationId: org.id,
              tournamentId: tournament.id,
              teamId: team.id,
              groupId: group.id,
              status: 'APPROVED',
            },
          }),
        ),
      )
      const snapshot = async (side: number, version: number, numberOffset = 0) => {
        const submission = await prisma.rosterSubmission.create({
          data: {
            organizationId: org.id,
            teamRegistrationId: registrations[side]!.id,
            submissionVersion: version,
            status: 'LOCKED',
            lockedAt: new Date(),
            sourceFileHash: String(version).repeat(64),
          },
        })
        const saved = await prisma.rosterSnapshot.create({
          data: {
            organizationId: org.id,
            teamId: teams[side]!.id,
            tournamentId: tournament.id,
            teamRegistrationId: registrations[side]!.id,
            rosterSubmissionId: submission.id,
            snapshotVersion: version,
            sourceFileHash: submission.sourceFileHash,
          },
        })
        await prisma.rosterSnapshotEntry.createMany({
          data: players[side]!.map((player, index) => ({
            organizationId: org.id,
            rosterSnapshotId: saved.id,
            playerProfileId: player.id,
            displayName: `FICTIONAL_TEST 冻结v${version}-${side}-${index}`,
            shirtNumber: String(numberOffset + index + 1),
            sortOrder: index,
          })),
        })
        await prisma.rosterSnapshot.update({
          where: { id: saved.id },
          data: { lockedAt: new Date() },
        })
        return saved.id
      }
      const homeSnapshot = await snapshot(0, 1),
        awaySnapshot = await snapshot(1, 1)
      const rule = await prisma.competitionRuleVersion.create({
        data: {
          organizationId: org.id,
          tournamentId: tournament.id,
          version: 1,
          name: 'FICTIONAL_TEST 八人制规程',
          status: 'PUBLISHED',
          rules: {
            roster: {
              playersOnPitch: 8,
              minPlayers: 8,
              maxPlayers: 18,
              submissionDeadline: '2099-01-01T00:00:00Z',
              eligiblePlayerIds: players.flat().map((player) => player.id),
            },
            results: {
              points: { win: 3, draw: 1, loss: 0 },
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
          organizationId: org.id,
          tournamentId: tournament.id,
          stageId: stage.id,
          groupId: group.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          matchCode: `TEST-${suffix}`,
          title: 'FICTIONAL_TEST 首发发布与真实赛果',
          status: 'SCHEDULED',
          scheduledStartAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })
      const password = 'FICTIONAL-Lineup-2026!'
      const credential = hashPassword(password)
      const account = (label: string, administrator: boolean) =>
        prisma.user.create({
          data: {
            loginNameNormalized: `${label}-${suffix}`,
            displayName: `FICTIONAL_TEST ${label}`,
            passwordCredential: {
              create: { passwordHash: credential.hash, passwordSalt: credential.salt },
            },
            memberships: { create: { organizationId: org.id, status: 'ACTIVE' } },
            ...(administrator
              ? {
                  roleAssignments: {
                    create: {
                      organizationId: org.id,
                      role: 'ORGANIZATION_ADMIN',
                      scopeType: 'ORGANIZATION',
                      scopeId: org.id,
                    },
                  },
                }
              : {}),
          },
        })
      const admin = await account('lineup-admin', true),
        student = await account('lineup-student', false)
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile()
      app = module.createNestApplication({ logger: false })
      configureApp(app)
      await app.init()
      const server = app.getHttpServer()
      const login = async (user: typeof admin) => {
        const response = await request(server)
          .post('/api/auth/login')
          .set('x-organization-id', org.id)
          .send({ username: user.loginNameNormalized, password })
          .expect(200)
        return `Bearer ${response.body.accessToken}`
      }
      const adminAuthorization = await login(admin),
        studentAuthorization = await login(student)
      const path = `/api/captain/teams/${home.id}/lineup-plans`
      const save = (input: object) =>
        request(server)
          .post(path)
          .set('Authorization', adminAuthorization)
          .set('Idempotency-Key', randomUUID())
          .send(input)
      const publish = (id: string, action: 'default' | 'confirm', expectedVersion: number) =>
        request(server)
          .post(`${path}/${id}/${action}`)
          .set('Authorization', adminAuthorization)
          .set('Idempotency-Key', randomUUID())
          .send({ expectedVersion })
      const read = async () => {
        const response = await request(server)
          .get(`/api/public/matches/${match.id}/experience`)
          .set('Authorization', studentAuthorization)
          .set('x-organization-id', org.id)
          .expect(200)
        assert.equal(response.body.resultsMode, 'OFFICIAL')
        const encoded = JSON.stringify(response.body)
        assert.equal(encoded.includes('PRIVATE_'), false)
        assert.equal(encoded.includes('studentId'), false)
        return response.body
      }
      const homeLineup = (response: Awaited<ReturnType<typeof read>>) =>
        response.lineups.find((lineup: { team: { id: string } }) => lineup.team.id === home.id)
      const payload = {
        formation: '3-3-1',
        format: 8,
        slots: players[0]!.slice(0, 8).map((player, index) => ({
          slotId: `slot-${index}`,
          label: index === 0 ? 'GK' : `P${index}`,
          x: 40,
          y: 10 + index * 10,
          playerId: player.id,
        })),
        benchPlayerIds: [players[0]![8]!.id],
      }
      const tactic = await save({
        name: 'PRIVATE_TEAM_TACTIC',
        kind: 'TACTIC',
        expectedVersion: 0,
        payload,
      }).expect(200)
      await publish(tactic.body.id, 'default', 1).expect(200)
      let visible = await read()
      assert.equal(homeLineup(visible).lineupSource, 'TEAM_DEFAULT')
      assert.equal(homeLineup(visible).players.length, 10)
      assert.equal(
        homeLineup(visible).players.filter((player: { starter: boolean }) => player.starter).length,
        8,
      )
      assert.equal(homeLineup(visible).appearanceRecorded, false)
      assert(
        visible.lineups.every((lineup: { players: Array<{ minutesPlayed: number | null }> }) =>
          lineup.players.every((player) => player.minutesPlayed === null),
        ),
      )
      const publishedDefault = homeLineup(visible)
      await save({
        name: 'PRIVATE_TEAM_TACTIC',
        kind: 'TACTIC',
        planId: tactic.body.id,
        expectedVersion: 1,
        payload: { ...payload, formation: 'PRIVATE_UNPUBLISHED_SHAPE' },
      }).expect(200)
      assert.deepEqual(
        homeLineup(await read()),
        publishedDefault,
        'Saving a private default-plan draft cannot change the public preview',
      )
      assert.deepEqual(visible.events, [])
      const input = {
        name: 'PRIVATE_MATCH_DRAFT',
        kind: 'MATCH_LINEUP',
        expectedVersion: 0,
        tournamentId: tournament.id,
        matchId: match.id,
        rosterSnapshotId: homeSnapshot,
        payload,
      }
      const plan = await save(input)
      assert.equal(plan.status, 200, JSON.stringify(plan.body))
      visible = await read()
      assert.deepEqual(
        homeLineup(visible),
        publishedDefault,
        'An unconfirmed match plan keeps the published team default visible',
      )
      await publish(plan.body.id, 'confirm', 1).expect(200)
      const first = homeLineup(await read())
      assert.equal(first.lineupSource, 'CONFIRMED_MATCH_LINEUP')
      assert.equal(first.appearanceRecorded, false)
      assert.equal(first.confirmedVersion, 1)
      assert.equal(first.formation, '3-3-1')
      assert.equal(first.players.filter((player: { starter: boolean }) => player.starter).length, 8)
      assert.equal(first.players.length, 9, 'Only the explicitly selected substitute is public')
      assert.ok(
        first.players.every(
          (player: { minutesPlayed: number | null }) => player.minutesPlayed === null,
        ),
      )
      assert.equal(first.players[0].displayName, 'FICTIONAL_TEST 冻结v1-0-0')
      assert.equal(first.players[0].shirtNumber, '1')
      assert.deepEqual(first.players[0].pitchPosition, { x: 40, y: 90 })
      await prisma.playerProfile.update({
        where: { id: players[0]![0]!.id },
        data: { displayName: 'PRIVATE_LATEST_PROFILE' },
      })
      const nextSnapshot = await snapshot(0, 2, 100)
      const draft = await save({
        ...input,
        planId: plan.body.id,
        expectedVersion: 1,
        rosterSnapshotId: nextSnapshot,
        payload: {
          ...payload,
          formation: '2-3-2',
          slots: payload.slots.map((slot, index) => ({
            ...slot,
            x: 60,
            playerId: index === 0 ? players[0]![9]!.id : slot.playerId,
          })),
        },
      }).expect(200)
      assert.equal(draft.body.hasUnconfirmedChanges, true)
      assert.deepEqual(
        homeLineup(await read()),
        first,
        'New head and latest roster cannot change the frozen v1',
      )
      await publish(plan.body.id, 'confirm', 2).expect(200)
      const second = homeLineup(await read())
      assert.equal(second.confirmedVersion, 2)
      assert.equal(second.formation, '2-3-2')
      assert.equal(second.players[0].id, players[0]![9]!.id)
      assert.equal(second.players[0].displayName, 'FICTIONAL_TEST 冻结v2-0-9')
      assert.equal(second.players[0].shirtNumber, '110')
      assert.deepEqual(second.players[0].pitchPosition, { x: 60, y: 90 })

      // Authorized upstream appearance fixtures. The report API does not invent appearances.
      await prisma.matchAppearance.createMany({
        data: players[0]!.slice(0, 9).map((player, index) => ({
          organizationId: org.id,
          matchId: match.id,
          teamId: home.id,
          playerId: player.id,
          starter: index !== 0,
          minutesPlayed: index === 0 ? 30 : index === 1 ? 60 : 90,
          shirtNumber: String(42 + index),
        })),
      })
      assert.deepEqual(
        homeLineup(await read()),
        second,
        'Unconfirmed appearance rows are not official facts',
      )
      const fields = {
        homeScore: '1',
        awayScore: '1',
        homePenaltyScore: '',
        awayPenaltyScore: '',
        outcome: 'FINISHED',
        notes: 'PRIVATE_REPORT_NOTES',
        events: [
          {
            clientEventId: 'home-goal',
            kind: 'GOAL',
            side: 'HOME',
            minute: '21',
            addedMinute: '',
            playerId: players[0]![1]!.id,
            relatedPlayerId: players[0]![2]!.id,
          },
          {
            clientEventId: 'away-goal',
            kind: 'GOAL',
            side: 'AWAY',
            minute: '38',
            addedMinute: '',
            playerId: players[1]![0]!.id,
            relatedPlayerId: '',
          },
          {
            clientEventId: 'home-swap',
            kind: 'SUBSTITUTION',
            side: 'HOME',
            minute: '60',
            addedMinute: '',
            playerId: players[0]![1]!.id,
            relatedPlayerId: players[0]![0]!.id,
          },
        ],
      }
      const reportPath = `/api/matches/${match.id}/report`
      await request(server)
        .post(reportPath)
        .set('Authorization', adminAuthorization)
        .send({
          clientActionId: randomUUID(),
          action: 'SUBMIT',
          expectedVersion: 0,
          reason: '',
          fields,
          homeRosterSnapshotId: nextSnapshot,
          awayRosterSnapshotId: awaySnapshot,
          ruleVersionId: rule.id,
        })
        .expect(200)
      assert.deepEqual(homeLineup(await read()), second)
      await request(server)
        .post(reportPath)
        .set('Authorization', adminAuthorization)
        .send({
          clientActionId: randomUUID(),
          action: 'CONFIRM',
          expectedVersion: 1,
          reason: '',
        })
        .expect(200)
      // The current public name may change independently; remove the deliberately private fixture marker.
      await prisma.playerProfile.update({
        where: { id: players[0]![0]!.id },
        data: { displayName: 'FICTIONAL_TEST 正式档案姓名' },
      })
      visible = await read()
      const official = homeLineup(visible)
      assert.equal(official.lineupSource, 'CONFIRMED_APPEARANCES')
      assert.equal(official.appearanceRecorded, true)
      assert.equal(official.formation, null)
      assert.equal(official.confirmedVersion, null)
      assert.equal(official.players.length, 9)
      assert.equal(
        official.players.find((player: { id: string }) => player.id === players[0]![0]!.id).starter,
        false,
      )
      assert.equal(
        official.players.find((player: { id: string }) => player.id === players[0]![0]!.id)
          .minutesPlayed,
        30,
      )
      assert.equal(
        official.players.find((player: { id: string }) => player.id === players[0]![8]!.id).starter,
        true,
      )
      assert.equal(
        official.players.find((player: { id: string }) => player.id === players[0]![8]!.id)
          .shirtNumber,
        '50',
      )
      assert.ok(
        !official.players.some((player: { id: string }) => player.id === players[0]![9]!.id),
      )
      assert.equal(visible.events.length, 3)
      assert.deepEqual(
        visible.events.map((event: { minute: number }) => event.minute),
        [21, 38, 60],
      )
      const swap = visible.events.find((event: { type: string }) => event.type === 'SUBSTITUTION')
      assert.equal(swap.player.id, players[0]![1]!.id)
      assert.equal(swap.relatedPlayer.id, players[0]![0]!.id)
      assert.equal(
        visible.lineups.find((lineup: { team: { id: string } }) => lineup.team.id === away.id)
          .lineupSource,
        'TEAM_ROSTER',
      )
    } finally {
      await app?.close()
      await prisma.$disconnect()
    }
  },
)
