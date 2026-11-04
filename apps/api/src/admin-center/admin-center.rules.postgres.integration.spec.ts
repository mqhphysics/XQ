import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { configureApp } from '../app.setup'
import { hashPassword } from '../auth/password'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'
import { MatchReportModule } from '../match-report/match-report.module'
import { RosterModule } from '../roster/roster.module'
import { AdminCenterModule } from './admin-center.module'

function disposableDatabase(): string {
  const value = process.env.TEST_DATABASE_URL
  assert.ok(value, 'Admin rule HTTP tests require a disposable TEST_DATABASE_URL')
  const parsed = new URL(value)
  assert.match(decodeURIComponent(parsed.pathname.slice(1)), /(?:^|_)(?:test|ci)(?:_|$)/)
  if (process.env.DATABASE_URL) {
    const daily = new URL(process.env.DATABASE_URL)
    assert.ok(
      parsed.hostname !== daily.hostname ||
        (parsed.port || '5432') !== (daily.port || '5432') ||
        parsed.pathname !== daily.pathname,
      'Never use the daily application database',
    )
  }
  return value
}

test('safe rule publication through real HTTP and PostgreSQL', { timeout: 90000 }, async (t) => {
  const prisma = new PrismaClient({ datasources: { db: { url: disposableDatabase() } } })
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const password = 'FICTIONAL-Admin-Rule-2026!'
  const digest = hashPassword(password)
  let app: INestApplication | undefined
  try {
    const org = await prisma.organization.create({
      data: { slug: `rule-admin-${suffix}`, name: 'FICTIONAL_TEST Rule Organization' },
    })
    const foreignOrg = await prisma.organization.create({
      data: { slug: `rule-foreign-${suffix}`, name: 'FICTIONAL_TEST Foreign Rule Organization' },
    })
    async function account(label: string) {
      return prisma.user.create({
        data: {
          loginNameNormalized: `rule-${suffix}-${label}`,
          displayName: `FICTIONAL_TEST_${label}`,
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
    }
    const admin = await account('admin')
    const student = await account('student')
    const tournamentAdmin = await account('tournament-admin')
    await prisma.roleAssignment.create({
      data: {
        userId: admin.id,
        organizationId: org.id,
        role: 'ORGANIZATION_ADMIN',
        scopeType: 'ORGANIZATION',
        scopeId: org.id,
      },
    })
    const season = await prisma.season.create({
      data: { organizationId: org.id, seasonCode: `RULE-${suffix}`, name: 'FICTIONAL_TEST Season' },
    })
    const tournament = await prisma.tournament.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        tournamentCode: `RULE-${suffix}`,
        name: 'FICTIONAL_TEST Cup',
      },
    })
    const unscoped = await prisma.tournament.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        tournamentCode: `RULE-OTHER-${suffix}`,
        name: 'FICTIONAL_TEST Other Cup',
      },
    })
    const foreignSeason = await prisma.season.create({
      data: {
        organizationId: foreignOrg.id,
        seasonCode: `RULE-${suffix}`,
        name: 'FICTIONAL_TEST Foreign Season',
      },
    })
    const foreignTournament = await prisma.tournament.create({
      data: {
        organizationId: foreignOrg.id,
        seasonId: foreignSeason.id,
        tournamentCode: `RULE-${suffix}`,
        name: 'FICTIONAL_TEST Foreign Cup',
      },
    })
    await prisma.roleAssignment.create({
      data: {
        userId: tournamentAdmin.id,
        organizationId: org.id,
        role: 'TOURNAMENT_ADMIN',
        scopeType: 'TOURNAMENT',
        scopeId: tournament.id,
      },
    })
    const team = await prisma.team.create({
      data: {
        organizationId: org.id,
        teamCode: `RULE-${suffix}`,
        name: 'FICTIONAL_TEST Rule Team',
      },
    })
    const player = await prisma.playerProfile.create({
      data: { organizationId: org.id, displayName: 'FICTIONAL_TEST Eligible Player', isDemo: true },
    })
    const outsidePlayer = await prisma.playerProfile.create({
      data: {
        organizationId: foreignOrg.id,
        displayName: 'FICTIONAL_TEST Foreign Player',
        isDemo: true,
      },
    })
    const awayTeam = await prisma.team.create({
      data: {
        organizationId: org.id,
        teamCode: `RULE-AWAY-${suffix}`,
        name: 'FICTIONAL_TEST Away Team',
      },
    })
    const awayPlayer = await prisma.playerProfile.create({
      data: { organizationId: org.id, displayName: 'FICTIONAL_TEST Away Player', isDemo: true },
    })
    await prisma.teamMembership.create({
      data: {
        organizationId: org.id,
        teamId: awayTeam.id,
        playerProfileId: awayPlayer.id,
        status: 'ACTIVE',
      },
    })
    await prisma.teamRegistration.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        teamId: awayTeam.id,
        status: 'APPROVED',
      },
    })
    const stage = await prisma.stage.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        stageCode: 'KNOCKOUT',
        name: 'FICTIONAL_TEST Knockout',
        type: 'KNOCKOUT',
      },
    })
    const otherStage = await prisma.stage.create({
      data: {
        organizationId: org.id,
        tournamentId: unscoped.id,
        stageCode: 'OTHER',
        name: 'FICTIONAL_TEST Other Knockout',
        type: 'KNOCKOUT',
      },
    })
    const foreignStage = await prisma.stage.create({
      data: {
        organizationId: foreignOrg.id,
        tournamentId: foreignTournament.id,
        stageCode: 'FOREIGN',
        name: 'FICTIONAL_TEST Foreign Knockout',
        type: 'KNOCKOUT',
      },
    })
    const source = await prisma.match.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        stageId: stage.id,
        matchCode: 'SOURCE',
        title: 'FICTIONAL_TEST Source Match',
      },
    })
    const target = await prisma.match.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        stageId: stage.id,
        matchCode: 'TARGET',
        title: 'FICTIONAL_TEST Target Match',
      },
    })
    const noStage = await prisma.match.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        matchCode: 'NO-STAGE',
        title: 'FICTIONAL_TEST No Stage Match',
      },
    })
    const outsideMatch = await prisma.match.create({
      data: {
        organizationId: org.id,
        tournamentId: unscoped.id,
        stageId: otherStage.id,
        matchCode: 'OUTSIDE',
        title: 'FICTIONAL_TEST Outside Match',
      },
    })
    const groupStage = await prisma.stage.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        stageCode: 'GROUP',
        name: 'FICTIONAL_TEST Group Stage',
        type: 'GROUP',
      },
    })
    const group = await prisma.tournamentGroup.create({
      data: {
        organizationId: org.id,
        stageId: groupStage.id,
        groupCode: 'A',
        name: 'FICTIONAL_TEST Group A',
      },
    })
    const module = await Test.createTestingModule({
      imports: [AdminCenterModule, MatchReportModule, RosterModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile()
    app = module.createNestApplication()
    configureApp(app)
    await app.init()
    const http = request(app.getHttpServer())
    async function login(username: string) {
      const response = await http
        .post('/api/auth/login')
        .set('x-organization-id', org.id)
        .send({ username, password })
        .expect(200)
      return `Bearer ${response.body.accessToken}`
    }
    const auth = await login(admin.loginNameNormalized!)
    const studentAuth = await login(student.loginNameNormalized!)
    const tournamentAuth = await login(tournamentAdmin.loginNameNormalized!)
    const reason = 'FICTIONAL_TEST rule review reason'
    const results = {
      points: { win: 3, draw: 1, loss: 0 },
      tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR', 'HEAD_TO_HEAD'],
      headToHead: {
        criteria: ['POINTS', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
        reapplyToRemainingTeams: true,
      },
      groupShootout: 'REJECT',
      knockoutShootout: 'ALLOWED',
      forfeit: { winnerGoals: 3, loserGoals: 0, loserPoints: 0, both: null },
    }
    const roster = {
      minPlayers: 1,
      maxPlayers: 20,
      submissionDeadline: '2027-01-01T00:00:00Z',
      eligiblePlayerIds: [player.id],
      playersOnPitch: 8,
    }
    const progression = {
      sourceStageId: stage.id,
      slots: [
        {
          targetMatchId: target.id,
          side: 'HOME',
          source: { type: 'MATCH_WINNER', matchId: source.id },
        },
      ],
    }
    const path = `/api/admin/center/tournaments/${tournament.id}/rule-versions`
    const body = {
      version: 1,
      expectedVersion: 0,
      name: 'FICTIONAL_TEST Complete rules',
      reason,
      rules: { results, roster },
    }
    function publish(command: Record<string, unknown>, key = randomUUID(), url = path) {
      return http.post(url).set('authorization', auth).set('idempotency-key', key).send(command)
    }

    await t.test(
      'organization-level authorization rejects anonymous, student, tournament-only and foreign writes',
      async () => {
        await http.post(path).set('idempotency-key', randomUUID()).send(body).expect(401)
        for (const token of [studentAuth, tournamentAuth])
          await http
            .post(path)
            .set('authorization', token)
            .set('idempotency-key', randomUUID())
            .send(body)
            .expect(403)
        await publish(
          body,
          randomUUID(),
          `/api/admin/center/tournaments/${foreignTournament.id}/rule-versions`,
        ).expect(404)
        await http.post(path).set('authorization', auth).send(body).expect(400)
      },
    )

    await t.test(
      'complete supported result/roster structures are required and invalid versions rejected',
      async () => {
        await publish({ ...body, rules: { summary: 'Legacy summary only' } }).expect(400)
        for (const playersOnPitch of [5, 7, 9, 11, '8', null])
          await publish({
            ...body,
            rules: { results, roster: { ...roster, playersOnPitch } },
          }).expect(400)
        await publish({
          ...body,
          rules: { results, roster: { ...roster, submissionDeadline: '2027-01-01' } },
        }).expect(400)
        await publish({
          ...body,
          rules: { results, roster: { ...roster, eligiblePlayerIds: [player.id, player.id] } },
        }).expect(400)
        await publish({ ...body, version: 0 }).expect(400)
        await publish({ ...body, expectedVersion: -1 }).expect(400)
        assert.equal(
          await prisma.competitionRuleVersion.count({ where: { tournamentId: tournament.id } }),
          0,
        )
      },
    )

    await t.test(
      'eligible players require same organization and active membership in this tournament participant team',
      async () => {
        await publish(body).expect(400)
        await prisma.teamMembership.create({
          data: {
            organizationId: org.id,
            teamId: team.id,
            playerProfileId: player.id,
            status: 'ACTIVE',
          },
        })
        await prisma.teamRegistration.create({
          data: {
            organizationId: org.id,
            tournamentId: unscoped.id,
            teamId: team.id,
            status: 'APPROVED',
          },
        })
        await publish(body).expect(400)
        await publish({
          ...body,
          rules: { results, roster: { ...roster, eligiblePlayerIds: [outsidePlayer.id] } },
        }).expect(400)
        await prisma.teamRegistration.create({
          data: {
            organizationId: org.id,
            tournamentId: tournament.id,
            teamId: team.id,
            groupId: group.id,
            status: 'APPROVED',
          },
        })
      },
    )

    let firstResponse: Record<string, unknown>
    const requestKey = randomUUID()
    await t.test(
      'concurrent same-key publication creates one version and one audited effect',
      async () => {
        const replies = await Promise.all([publish(body, requestKey), publish(body, requestKey)])
        assert.ok(replies.every((reply) => reply.status === 200))
        assert.deepEqual(replies[0]!.body, replies[1]!.body)
        firstResponse = replies[0]!.body
        assert.equal(replies[0]!.body.rules.roster.playersOnPitch, 8)
        assert.equal(
          await prisma.competitionRuleVersion.count({ where: { tournamentId: tournament.id } }),
          1,
        )
        const audit = await prisma.auditLog.findMany({
          where: {
            organizationId: org.id,
            targetId: tournament.id,
            action: 'COMPETITION_RULE_VERSION_PUBLISHED',
          },
        })
        assert.equal(audit.length, 1)
        assert.equal(audit[0]!.reason, reason)
        assert.deepEqual(audit[0]!.beforeSummary, { version: 0 })
        assert.equal((audit[0]!.afterSummary as { version: number }).version, 1)
      },
    )

    await t.test(
      'stale expected version, non-increasing version and changed same-key body cannot overwrite',
      async () => {
        await publish({ ...body, name: 'Changed content' }, requestKey).expect(409)
        await publish({ ...body, version: 2 }).expect(409)
        await publish({ ...body, expectedVersion: 1 }).expect(409)
        assert.deepEqual((await publish(body, requestKey).expect(200)).body, firstResponse!)
      },
    )

    const next = { ...body, version: 2, expectedVersion: 1 }
    await t.test(
      'progression source/target stage, match and group objects are scoped and avoid cycles',
      async () => {
        for (const sourceStageId of [otherStage.id, foreignStage.id])
          await publish({
            ...next,
            rules: { results, roster, progression: { ...progression, sourceStageId } },
          }).expect(400)
        for (const targetMatchId of [outsideMatch.id, noStage.id])
          await publish({
            ...next,
            rules: {
              results,
              roster,
              progression: { ...progression, slots: [{ ...progression.slots[0], targetMatchId }] },
            },
          }).expect(400)
        await publish({
          ...next,
          rules: {
            results,
            roster,
            progression: {
              ...progression,
              slots: [
                {
                  ...progression.slots[0],
                  source: { type: 'MATCH_WINNER', matchId: outsideMatch.id },
                },
              ],
            },
          },
        }).expect(400)
        await publish({
          ...next,
          rules: {
            results,
            roster,
            progression: {
              ...progression,
              slots: [{ ...progression.slots[0], targetMatchId: source.id }],
            },
          },
        }).expect(400)
        const grouped = {
          sourceStageId: groupStage.id,
          slots: [
            {
              targetMatchId: target.id,
              side: 'HOME',
              source: { type: 'GROUP_RANK', groupId: group.id, rank: 2 },
            },
          ],
        }
        await publish({ ...next, rules: { results, roster, progression: grouped } }).expect(400)
        await publish({
          ...next,
          rules: {
            results,
            roster,
            progression: {
              ...grouped,
              slots: [
                {
                  ...grouped.slots[0],
                  source: { type: 'GROUP_RANK', groupId: randomUUID(), rank: 1 },
                },
              ],
            },
          },
        }).expect(400)
      },
    )

    await t.test(
      'append valid progression v2 then safely replay v1 without moving latest or mutating historical content',
      async () => {
        const created = await publish({
          ...next,
          rules: {
            results,
            roster: { ...roster, eligiblePlayerIds: [player.id, awayPlayer.id] },
            progression,
          },
        }).expect(200)
        assert.equal(created.body.version, 2)
        const replay = await publish(body, requestKey).expect(200)
        assert.equal(replay.body.version, 1)
        const history = await prisma.competitionRuleVersion.findMany({
          where: { tournamentId: tournament.id },
          orderBy: { version: 'asc' },
        })
        assert.deepEqual(
          history.map((row) => row.version),
          [1, 2],
        )
        assert.equal(history[0]!.name, body.name)
        assert.ok(!Object.hasOwn(history[0]!.rules as object, 'progression'))
      },
    )

    await t.test(
      'bound draft, returned and confirmed reports prevent new rules without new effects and preserve old replays',
      async () => {
        for (const [teamId, playerId] of [
          [team.id, player.id],
          [awayTeam.id, awayPlayer.id],
        ]) {
          const rosterPath = `/api/roster/tournaments/${tournament.id}/teams/${teamId}/commands`
          for (const [action, expectedVersion] of [
            ['SUBMIT', 0],
            ['APPROVE', 1],
            ['LOCK', 2],
          ] as const) {
            await http
              .post(rosterPath)
              .set('authorization', auth)
              .set('idempotency-key', randomUUID())
              .send({
                action,
                expectedVersion,
                ...(action === 'SUBMIT' ? { players: [{ playerId, shirtNumber: '01' }] } : {}),
              })
              .expect(200)
          }
        }
        await prisma.match.update({
          where: { id: source.id },
          data: { homeTeamId: team.id, awayTeamId: awayTeam.id },
        })
        const path = `/api/matches/${source.id}/report`
        const workspace = await http.get(path).set('authorization', auth).expect(200)
        assert.deepEqual(workspace.body.blockingReasons, [])
        const fields = {
          homeScore: '1',
          awayScore: '0',
          homePenaltyScore: '',
          awayPenaltyScore: '',
          outcome: 'FINISHED',
          notes: 'FICTIONAL_TEST Bound rule guard',
          events: [
            {
              clientEventId: 'guard-goal',
              kind: 'GOAL',
              side: 'HOME',
              minute: '10',
              addedMinute: '',
              playerId: player.id,
              relatedPlayerId: '',
            },
          ],
        }
        const binding = {
          homeRosterSnapshotId: workspace.body.homeTeam.rosterSnapshotId,
          awayRosterSnapshotId: workspace.body.awayTeam.rosterSnapshotId,
          ruleVersionId: workspace.body.ruleVersionId,
          fields,
        }
        const beforeAuditCount = await prisma.auditLog.count({
          where: {
            organizationId: org.id,
            targetId: tournament.id,
            action: 'COMPETITION_RULE_VERSION_PUBLISHED',
          },
        })
        for (const [action, expectedVersion] of [
          ['SAVE', 0],
          ['SUBMIT', 1],
          ['RETURN', 2],
          ['SAVE', 3],
          ['SUBMIT', 4],
          ['CONFIRM', 5],
        ] as const) {
          const report = await http
            .post(path)
            .set('authorization', auth)
            .send({
              clientActionId: randomUUID(),
              action,
              expectedVersion,
              reason,
              ...(['SAVE', 'SUBMIT'].includes(action) ? binding : {}),
            })
            .expect(200)
          assert.equal(report.body.reportVersion, expectedVersion + 1)
          const guard = await publish({ ...body, version: 3, expectedVersion: 2 }).expect(409)
          assert.match(guard.body.message, /显式规程迁移评审/)
          assert.equal(
            await prisma.competitionRuleVersion.count({ where: { tournamentId: tournament.id } }),
            2,
          )
          assert.equal(
            await prisma.auditLog.count({
              where: {
                organizationId: org.id,
                targetId: tournament.id,
                action: 'COMPETITION_RULE_VERSION_PUBLISHED',
              },
            }),
            beforeAuditCount,
          )
        }
        const saved = await prisma.matchReportRevision.findFirstOrThrow({
          where: { matchId: source.id },
          orderBy: { version: 'desc' },
        })
        assert.equal(saved.status, 'CONFIRMED')
        assert.equal(saved.ruleVersionId, workspace.body.ruleVersionId)
        assert.deepEqual((await publish(body, requestKey).expect(200)).body, firstResponse!)
      },
    )
  } finally {
    if (app) await app.close()
    await prisma.$disconnect()
  }
})
