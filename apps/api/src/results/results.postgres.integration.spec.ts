import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'

import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { configureApp } from '../app.setup'
import { hashPassword } from '../auth/password'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient, type Prisma } from '../generated/prisma/client'
import { ResultsModule } from './results.module'

type RunningWorker = { start(): Promise<void>; stop(): Promise<void> }
const load = createRequire(resolve(process.cwd(), 'package.json'))
const { createWorkerRuntime } = load(
  resolve(process.cwd(), '../worker/dist/worker-runtime.js'),
) as { createWorkerRuntime(env: NodeJS.ProcessEnv, onError: (code: string) => void): RunningWorker }

function disposableDatabase(): string {
  const value = process.env.TEST_DATABASE_URL
  assert.ok(value, 'Results HTTP tests require a disposable TEST_DATABASE_URL')
  const parsed = new URL(value)
  assert.match(decodeURIComponent(parsed.pathname.slice(1)), /(?:^|_)(?:test|ci)(?:_|$)/)
  if (process.env.DATABASE_URL) {
    const daily = new URL(process.env.DATABASE_URL)
    assert.ok(
      parsed.hostname !== daily.hostname ||
        (parsed.port || '5432') !== (daily.port || '5432') ||
        parsed.pathname !== daily.pathname ||
        (process.env.CI === 'true' &&
          decodeURIComponent(parsed.pathname.slice(1)) === 'xiaoqiu_ci'),
      'Never use the daily application database',
    )
  }
  return value
}

test(
  'real result HTTP, latest confirmations, pg Worker and progression transactions',
  { timeout: 90000 },
  async (t) => {
    const databaseUrl = disposableDatabase()
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const password = 'FICTIONAL-Results-2026!'
    const digest = hashPassword(password)
    let app: INestApplication | undefined
    let worker: RunningWorker | undefined
    const workerErrors: string[] = []
    try {
      const org = await prisma.organization.create({
        data: { slug: `results-${suffix}`, name: 'FICTIONAL_TEST 结果组织' },
      })
      const otherOrg = await prisma.organization.create({
        data: { slug: `results-other-${suffix}`, name: 'FICTIONAL_TEST 其他组织' },
      })
      async function user(label: string) {
        return prisma.user.create({
          data: {
            loginNameNormalized: `results-${suffix}-${label}`,
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
      const admin = await user('admin')
      await user('student')
      const tournamentAdmin = await user('tournament-admin')
      const season = await prisma.season.create({
        data: {
          organizationId: org.id,
          seasonCode: `RESULTS-${suffix}`,
          name: 'FICTIONAL_TEST Season',
        },
      })
      const tournament = await prisma.tournament.create({
        data: {
          organizationId: org.id,
          seasonId: season.id,
          tournamentCode: `RESULTS-${suffix}`,
          name: 'FICTIONAL_TEST Cup',
          status: 'PUBLISHED',
        },
      })
      const unscoped = await prisma.tournament.create({
        data: {
          organizationId: org.id,
          seasonId: season.id,
          tournamentCode: `OTHER-${suffix}`,
          name: 'FICTIONAL_TEST Other Cup',
          status: 'PUBLISHED',
        },
      })
      const draft = await prisma.tournament.create({
        data: {
          organizationId: org.id,
          seasonId: season.id,
          tournamentCode: `DRAFT-${suffix}`,
          name: 'FICTIONAL_TEST Draft',
          status: 'DRAFT',
        },
      })
      const adminRole = await prisma.roleAssignment.create({
        data: {
          userId: admin.id,
          organizationId: org.id,
          role: 'ORGANIZATION_ADMIN',
          scopeType: 'ORGANIZATION',
          scopeId: org.id,
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
      const sourceStage = await prisma.stage.create({
        data: {
          organizationId: org.id,
          tournamentId: tournament.id,
          stageCode: 'SOURCE',
          name: 'FICTIONAL_TEST Groups',
          type: 'GROUP',
        },
      })
      const targetStage = await prisma.stage.create({
        data: {
          organizationId: org.id,
          tournamentId: tournament.id,
          stageCode: 'TARGET',
          name: 'FICTIONAL_TEST Final',
          type: 'KNOCKOUT',
        },
      })
      const group = await prisma.tournamentGroup.create({
        data: {
          organizationId: org.id,
          stageId: sourceStage.id,
          groupCode: 'A',
          name: 'FICTIONAL_TEST Group',
        },
      })
      const teams = await Promise.all(
        ['a', 'b'].map((label) =>
          prisma.team.create({
            data: {
              organizationId: org.id,
              teamCode: `${suffix}-${label}`,
              name: `FICTIONAL_TEST_${label}`,
            },
          }),
        ),
      )
      const snapshots: string[] = []
      for (const team of teams) {
        const registration = await prisma.teamRegistration.create({
          data: {
            organizationId: org.id,
            tournamentId: tournament.id,
            teamId: team.id,
            groupId: group.id,
            status: 'APPROVED',
          },
        })
        const submission = await prisma.rosterSubmission.create({
          data: {
            organizationId: org.id,
            teamRegistrationId: registration.id,
            submissionVersion: 1,
            sourceFileHash: 'a'.repeat(64),
            status: 'LOCKED',
            lockedAt: new Date(),
          },
        })
        const snapshot = await prisma.rosterSnapshot.create({
          data: {
            organizationId: org.id,
            tournamentId: tournament.id,
            teamId: team.id,
            teamRegistrationId: registration.id,
            rosterSubmissionId: submission.id,
            snapshotVersion: 1,
            sourceFileHash: 'a'.repeat(64),
            lockedAt: new Date(),
          },
        })
        snapshots.push(snapshot.id)
      }
      const source = await prisma.match.create({
        data: {
          organizationId: org.id,
          tournamentId: tournament.id,
          stageId: sourceStage.id,
          groupId: group.id,
          matchCode: `${suffix}-SOURCE`,
          title: 'FICTIONAL_TEST source',
          status: 'FINISHED',
          homeTeamId: teams[0]!.id,
          awayTeamId: teams[1]!.id,
          homeScore: 1,
          awayScore: 0,
          scheduledStartAt: new Date('2026-10-01T10:00:00Z'),
        },
      })
      const target = await prisma.match.create({
        data: {
          organizationId: org.id,
          tournamentId: tournament.id,
          stageId: targetStage.id,
          matchCode: `${suffix}-TARGET`,
          title: 'FICTIONAL_TEST final',
          status: 'SCHEDULED',
        },
      })
      const rule = await prisma.competitionRuleVersion.create({
        data: {
          organizationId: org.id,
          tournamentId: tournament.id,
          version: 1,
          name: 'FICTIONAL_TEST Explicit Rules',
          rules: {
            results: {
              points: { win: 3, draw: 1, loss: 0 },
              tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR', 'HEAD_TO_HEAD'],
              headToHead: {
                criteria: ['POINTS', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
                reapplyToRemainingTeams: true,
              },
              groupShootout: 'REJECT',
              knockoutShootout: 'ALLOWED',
              forfeit: { winnerGoals: 3, loserGoals: 0, loserPoints: 0, both: null },
            },
            progression: {
              sourceStageId: sourceStage.id,
              slots: [
                {
                  targetMatchId: target.id,
                  side: 'HOME',
                  source: { type: 'GROUP_RANK', groupId: group.id, rank: 1 },
                },
                {
                  targetMatchId: target.id,
                  side: 'AWAY',
                  source: { type: 'GROUP_RANK', groupId: group.id, rank: 2 },
                },
              ],
            },
          },
        },
      })
      async function confirmation(
        version: number,
        home: string,
        away: string,
        outcome = 'FINISHED',
      ) {
        return prisma.$transaction(async (tx) => {
          const revision = await tx.matchReportRevision.create({
            data: {
              organizationId: org.id,
              matchId: source.id,
              version,
              status: 'CONFIRMED',
              action: 'CONFIRM',
              fields: {
                _matchContext: {
                  organizationId: org.id,
                  matchId: source.id,
                  tournamentId: tournament.id,
                  stageId: sourceStage.id,
                  groupId: group.id,
                  roundId: null,
                  homeTeamId: teams[0]!.id,
                  awayTeamId: teams[1]!.id,
                  scheduledStartAt: source.scheduledStartAt!.toISOString(),
                },
                outcome,
                homeScore: home,
                awayScore: away,
                homePenaltyScore: '',
                awayPenaltyScore: '',
                events: [],
                notes: 'FICTIONAL_PRIVATE_NOTES',
              },
              homeRosterSnapshotId: snapshots[0]!,
              awayRosterSnapshotId: snapshots[1]!,
              ruleVersionId: rule.id,
              createdByUserId: admin.id,
            },
          })
          await tx.match.update({
            where: { id: source.id },
            data: {
              reportVersion: version,
              confirmedReportVersion: version,
              homeScore: home === '' ? null : Number(home),
              awayScore: away === '' ? null : Number(away),
              status: outcome === 'ABANDONED' ? 'CANCELLED' : 'FINISHED',
            },
          })
          return revision
        })
      }
      async function event(revisionId: string, version: number, organizationId = org.id) {
        return prisma.outboxJob.create({
          data: {
            organizationId,
            topic: 'match.report',
            aggregateType: 'Match',
            aggregateId: source.id,
            eventType: 'MatchReportConfirmed',
            payload: {
              matchId: source.id,
              tournamentId: tournament.id,
              confirmedReportVersion: version,
              revisionId,
              ruleVersionId: rule.id,
            },
            deduplicationKey: `FICTIONAL_TEST:${randomUUID()}`,
          },
        })
      }
      const first = await confirmation(1, '1', '0')
      const second = await confirmation(2, '0', '3')
      const currentJob = await event(second.id, 2)
      const oldJob = await event(first.id, 1)
      const wrongOrgJob = await event(second.id, 2, otherOrg.id)
      const module = await Test.createTestingModule({ imports: [ResultsModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile()
      app = module.createNestApplication({ logger: false })
      configureApp(app)
      await app.init()
      const server = app.getHttpServer()
      async function login(label: string) {
        const response = await request(server)
          .post('/api/auth/login')
          .set('x-organization-id', org.id)
          .send({ username: `results-${suffix}-${label}`, password })
          .expect(200)
        assert.ok(response.body.accessToken)
        return `Bearer ${response.body.accessToken}`
      }
      const adminToken = await login('admin')
      const studentToken = await login('student')
      const scopedToken = await login('tournament-admin')
      const read = () =>
        request(server)
          .get(`/api/public/tournaments/${tournament.id}/results`)
          .set('authorization', studentToken)
          .set('x-organization-id', org.id)
      const preview = (token = adminToken) =>
        request(server)
          .post(`/api/admin/tournaments/${tournament.id}/progression/preview`)
          .set('authorization', token)
          .send({ ruleVersionId: rule.id })
      function confirm(body: object, key: string, token = adminToken) {
        return request(server)
          .post(`/api/admin/tournaments/${tournament.id}/progression/confirm`)
          .set('authorization', token)
          .set('Idempotency-Key', key)
          .send(body)
      }
      await t.test(
        'public reads newest confirmation with no projection and excludes restricted fields',
        async () => {
          const privateFixture = await prisma.match.create({
            data: {
              organizationId: org.id,
              tournamentId: tournament.id,
              matchCode: `PRIVATE-DRAFT-${suffix}`,
              title: 'FICTIONAL_TEST unpublished fixture',
              status: 'DRAFT',
            },
          })
          const response = await read().expect(200)
          assert.equal(Object.hasOwn(response.body.sourceVersions, privateFixture.id), false)
          assert.equal(JSON.stringify(response.body).includes(privateFixture.id), false)
          assert.equal(response.body.confirmedResults[0].revision, 2)
          assert.equal(response.body.confirmedResults[0].awayScore, 3)
          assert.equal(response.body.groups[0].standings.rows[0].teamId, teams[1]!.id)
          assert.equal(JSON.stringify(response.body).includes('PRIVATE'), false)
          await request(server)
            .get(`/api/public/tournaments/${draft.id}/results`)
            .set('authorization', studentToken)
            .set('x-organization-id', org.id)
            .expect(404)
          await request(server)
            .get(`/api/public/tournaments/${tournament.id}/results`)
            .set('authorization', studentToken)
            .set('x-organization-id', otherOrg.id)
            .expect(403)
        },
      )
      await t.test(
        'actual Worker start/poll/stop consumes inverse jobs and rejects cross organization',
        async () => {
          worker = createWorkerRuntime(
            { ...process.env, DATABASE_URL: databaseUrl, WORKER_POLL_MS: '100' },
            (code) => workerErrors.push(code),
          )
          await worker.start()
          const deadline = Date.now() + 5000
          while (Date.now() < deadline) {
            const unfinished = await prisma.outboxJob.count({
              where: {
                id: { in: [currentJob.id, oldJob.id, wrongOrgJob.id] },
                status: { in: ['PENDING', 'PROCESSING', 'FAILED_RETRYABLE'] },
              },
            })
            if (unfinished === 0) break
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 50)
            })
          }
          await worker.stop()
          await worker.stop()
          worker = undefined
          const projection = await prisma.matchResultProjection.findUniqueOrThrow({
            where: { organizationId_matchId: { organizationId: org.id, matchId: source.id } },
          })
          assert.equal(projection.sourceReportVersion, 2)
          assert.equal(projection.reportRevisionId, second.id)
          assert.equal((projection.payload as Record<string, unknown>).awayScore, 3)
          assert.equal(JSON.stringify(projection.payload).includes('PRIVATE'), false)
          assert.equal(
            (await prisma.outboxJob.findUniqueOrThrow({ where: { id: currentJob.id } })).status,
            'SUCCEEDED',
          )
          assert.equal(
            (await prisma.outboxJob.findUniqueOrThrow({ where: { id: oldJob.id } })).status,
            'SUCCEEDED',
          )
          assert.equal(
            (await prisma.outboxJob.findUniqueOrThrow({ where: { id: wrongOrgJob.id } })).status,
            'FAILED_PERMANENT',
          )
          assert.deepEqual(workerErrors, [])
        },
      )
      await t.test(
        'role/object checks reject dev escalation, ordinary users and wrong tournament scope',
        async () => {
          await preview(studentToken).expect(403)
          await request(server)
            .post(`/api/admin/tournaments/${tournament.id}/progression/preview`)
            .set('x-organization-id', org.id)
            .set('x-dev-role', 'TOURNAMENT_ADMIN')
            .send({ ruleVersionId: rule.id })
            .expect(401)
          await preview(scopedToken).expect(200)
          await request(server)
            .post(`/api/admin/tournaments/${unscoped.id}/progression/preview`)
            .set('authorization', scopedToken)
            .send({ ruleVersionId: rule.id })
            .expect(403)
        },
      )
      let confirmedHash = ''
      let successKey = ''
      let successCommand: Record<string, unknown> = {}
      let successResponse: Record<string, unknown> = {}
      await t.test(
        'notification receipts acknowledge existing records without duplicating or resetting read status',
        async () => {
          const readAt = new Date('2026-10-01T12:00:00Z')
          const notification = await prisma.userNotification.create({
            data: {
              organizationId: org.id,
              recipientUserId: admin.id,
              actorUserId: admin.id,
              type: 'MATCH_REPORT_REVIEWED',
              title: 'FICTIONAL_TEST Report reviewed',
              readAt,
              deduplicationKey: `match-report:${second.id}:${admin.id}`,
              metadata: {
                matchId: source.id,
                revisionId: second.id,
                reportVersion: 2,
                action: 'CONFIRM',
              },
            },
          })
          const receipt = {
            organizationId: org.id,
            matchId: source.id,
            tournamentId: tournament.id,
            revisionId: second.id,
            reportVersion: 2,
            action: 'CONFIRM',
            recipientUserIds: [admin.id],
            notificationIds: [notification.id],
          }
          const enqueueReceipt = (payload: object) =>
            prisma.outboxJob.create({
              data: {
                organizationId: org.id,
                topic: 'match.report.notification',
                aggregateType: 'MatchReportRevision',
                aggregateId: second.id,
                eventType: 'MatchReportNotificationCreated',
                payload: payload as Prisma.InputJsonValue,
                deduplicationKey: `FICTIONAL_TEST-receipt:${randomUUID()}`,
              },
            })
          const good = await enqueueReceipt(receipt)
          const repeat = await enqueueReceipt(receipt)
          const wrong = await enqueueReceipt({
            ...receipt,
            recipientUserIds: [tournamentAdmin.id],
          })
          const empty = await enqueueReceipt({
            ...receipt,
            recipientUserIds: [],
            notificationIds: [],
          })
          worker = createWorkerRuntime(
            { ...process.env, DATABASE_URL: databaseUrl, WORKER_POLL_MS: '100' },
            (code) => workerErrors.push(code),
          )
          await worker.start()
          const deadline = Date.now() + 5000
          while (
            Date.now() < deadline &&
            (await prisma.outboxJob.count({
              where: {
                id: { in: [good.id, repeat.id, wrong.id, empty.id] },
                status: { in: ['PENDING', 'PROCESSING', 'FAILED_RETRYABLE'] },
              },
            })) > 0
          )
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 50)
            })
          await worker.stop()
          worker = undefined
          for (const id of [good.id, repeat.id, empty.id])
            assert.equal(
              (await prisma.outboxJob.findUniqueOrThrow({ where: { id } })).status,
              'SUCCEEDED',
            )
          assert.equal(
            (await prisma.outboxJob.findUniqueOrThrow({ where: { id: wrong.id } })).status,
            'FAILED_PERMANENT',
          )
          assert.equal(
            (
              await prisma.userNotification.findUniqueOrThrow({ where: { id: notification.id } })
            ).readAt!.toISOString(),
            readAt.toISOString(),
          )
          assert.equal(
            await prisma.userNotification.count({
              where: { organizationId: org.id, deduplicationKey: notification.deduplicationKey },
            }),
            1,
          )
        },
      )
      await t.test(
        'same knockout Stage advances explicit semifinal sources without waiting for future rounds',
        async () => {
          const cup = await prisma.tournament.create({
            data: {
              organizationId: org.id,
              seasonId: season.id,
              tournamentCode: `KO-${suffix}`,
              name: 'FICTIONAL_TEST KO Cup',
              status: 'PUBLISHED',
            },
          })
          const stage = await prisma.stage.create({
            data: {
              organizationId: org.id,
              tournamentId: cup.id,
              stageCode: 'KO',
              name: 'FICTIONAL_TEST KO Stage',
              type: 'KNOCKOUT',
            },
          })
          const roundOne = await prisma.competitionRound.create({
            data: {
              organizationId: org.id,
              stageId: stage.id,
              roundNumber: 1,
              name: 'FICTIONAL_TEST Semifinals',
            },
          })
          const roundTwo = await prisma.competitionRound.create({
            data: {
              organizationId: org.id,
              stageId: stage.id,
              roundNumber: 2,
              name: 'FICTIONAL_TEST Finals',
            },
          })
          const clubs = [
            ...teams,
            ...(await Promise.all(
              ['c', 'd'].map((label) =>
                prisma.team.create({
                  data: {
                    organizationId: org.id,
                    teamCode: `${suffix}-${label}`,
                    name: `FICTIONAL_TEST_${label}`,
                  },
                }),
              ),
            )),
          ]
          const rosters: string[] = []
          for (const club of clubs) {
            const registration = await prisma.teamRegistration.create({
              data: {
                organizationId: org.id,
                tournamentId: cup.id,
                teamId: club.id,
                status: 'APPROVED',
              },
            })
            const submission = await prisma.rosterSubmission.create({
              data: {
                organizationId: org.id,
                teamRegistrationId: registration.id,
                submissionVersion: 1,
                sourceFileHash: 'b'.repeat(64),
                status: 'LOCKED',
                lockedAt: new Date(),
              },
            })
            rosters.push(
              (
                await prisma.rosterSnapshot.create({
                  data: {
                    organizationId: org.id,
                    tournamentId: cup.id,
                    teamId: club.id,
                    teamRegistrationId: registration.id,
                    rosterSubmissionId: submission.id,
                    snapshotVersion: 1,
                    sourceFileHash: 'b'.repeat(64),
                    lockedAt: new Date(),
                  },
                })
              ).id,
            )
          }
          const semis = await Promise.all(
            [0, 1].map((index) =>
              prisma.match.create({
                data: {
                  organizationId: org.id,
                  tournamentId: cup.id,
                  stageId: stage.id,
                  roundId: roundOne.id,
                  matchCode: `${suffix}-SEMI-${index}`,
                  title: 'FICTIONAL_TEST semifinal',
                  homeTeamId: clubs[index * 2]!.id,
                  awayTeamId: clubs[index * 2 + 1]!.id,
                  status: 'FINISHED',
                },
              }),
            ),
          )
          const finals = await Promise.all(
            ['final', 'bronze'].map((name) =>
              prisma.match.create({
                data: {
                  organizationId: org.id,
                  tournamentId: cup.id,
                  stageId: stage.id,
                  roundId: roundTwo.id,
                  matchCode: `${suffix}-${name}`,
                  title: `FICTIONAL_TEST ${name}`,
                  status: 'SCHEDULED',
                },
              }),
            ),
          )
          const knockoutRule = await prisma.competitionRuleVersion.create({
            data: {
              organizationId: org.id,
              tournamentId: cup.id,
              version: 1,
              name: 'FICTIONAL_TEST Explicit KO Rules',
              rules: {
                results: (rule.rules as Record<string, Prisma.InputJsonValue>).results!,
                progression: {
                  sourceStageId: stage.id,
                  slots: semis.flatMap((semi, index) => [
                    {
                      targetMatchId: finals[0]!.id,
                      side: index === 0 ? 'HOME' : 'AWAY',
                      source: { type: 'MATCH_WINNER', matchId: semi.id },
                    },
                    {
                      targetMatchId: finals[1]!.id,
                      side: index === 0 ? 'HOME' : 'AWAY',
                      source: { type: 'MATCH_LOSER', matchId: semi.id },
                    },
                  ]),
                },
              },
            },
          })
          for (const [index, semi] of semis.entries()) {
            await prisma.matchReportRevision.create({
              data: {
                organizationId: org.id,
                matchId: semi.id,
                version: 1,
                status: 'CONFIRMED',
                action: 'CONFIRM',
                createdByUserId: admin.id,
                homeRosterSnapshotId: rosters[index * 2]!,
                awayRosterSnapshotId: rosters[index * 2 + 1]!,
                ruleVersionId: knockoutRule.id,
                fields: {
                  outcome: 'FINISHED',
                  homeScore: index === 0 ? '1' : '2',
                  awayScore: index === 0 ? '1' : '0',
                  homePenaltyScore: index === 0 ? '5' : '',
                  awayPenaltyScore: index === 0 ? '4' : '',
                  _matchContext: {
                    organizationId: org.id,
                    matchId: semi.id,
                    tournamentId: cup.id,
                    stageId: stage.id,
                    groupId: null,
                    roundId: roundOne.id,
                    homeTeamId: semi.homeTeamId,
                    awayTeamId: semi.awayTeamId,
                    scheduledStartAt: null,
                  },
                },
              },
            })
            await prisma.match.update({
              where: { id: semi.id },
              data: { reportVersion: 1, confirmedReportVersion: 1 },
            })
          }
          const endpoint = `/api/admin/tournaments/${cup.id}/progression`
          const proposal = (
            await request(server)
              .post(`${endpoint}/preview`)
              .set('authorization', adminToken)
              .send({ ruleVersionId: knockoutRule.id })
              .expect(200)
          ).body
          assert.equal(proposal.status, 'READY')
          assert.equal(proposal.sourceVersions.matches.length, 2)
          const body = {
            ruleVersionId: knockoutRule.id,
            expectedVersion: 0,
            sourceHash: proposal.sourceHash,
            reason: 'FICTIONAL_TEST KO progression',
          }
          const key = randomUUID()
          const confirmed = await request(server)
            .post(`${endpoint}/confirm`)
            .set('authorization', adminToken)
            .set('Idempotency-Key', key)
            .send(body)
            .expect(200)
          const final = await prisma.match.findUniqueOrThrow({ where: { id: finals[0]!.id } })
          const bronze = await prisma.match.findUniqueOrThrow({ where: { id: finals[1]!.id } })
          assert.equal(final.homeTeamId, clubs[0]!.id)
          assert.equal(final.awayTeamId, clubs[2]!.id)
          assert.equal(bronze.homeTeamId, clubs[1]!.id)
          assert.equal(bronze.awayTeamId, clubs[3]!.id)
          await prisma.match.update({
            where: { id: final.id },
            data: { status: 'LIVE', reportVersion: 1 },
          })
          const replay = await request(server)
            .post(`${endpoint}/confirm`)
            .set('authorization', adminToken)
            .set('Idempotency-Key', key)
            .send(body)
            .expect(200)
          assert.deepEqual(replay.body, confirmed.body)
          assert.equal(
            await prisma.tournamentProgression.count({ where: { tournamentId: cup.id } }),
            1,
          )
        },
      )
      await t.test(
        'Outbox failure rolls back target slots, progression version, history and audit',
        async () => {
          const proposal = (await preview().expect(200)).body
          const blocker = await prisma.outboxJob.create({
            data: {
              organizationId: org.id,
              topic: 'FICTIONAL_TEST.failure',
              aggregateType: 'Test',
              aggregateId: tournament.id,
              eventType: 'Test',
              payload: {},
              deduplicationKey: `tournament-progression-confirmed:${tournament.id}:1`,
            },
          })
          try {
            await confirm(
              {
                ruleVersionId: rule.id,
                expectedVersion: 0,
                sourceHash: proposal.sourceHash,
                reason: 'FICTIONAL_TEST rollback',
              },
              randomUUID(),
            ).expect(500)
            assert.equal(
              (await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } }))
                .progressionVersion,
              0,
            )
            assert.equal(
              (await prisma.match.findUniqueOrThrow({ where: { id: target.id } })).homeTeamId,
              null,
            )
            assert.equal(
              await prisma.tournamentProgression.count({ where: { tournamentId: tournament.id } }),
              0,
            )
            assert.equal(
              await prisma.auditLog.count({
                where: { targetId: tournament.id, action: 'TOURNAMENT_PROGRESSION_CONFIRMED' },
              }),
              0,
            )
          } finally {
            await prisma.outboxJob.delete({ where: { id: blocker.id } })
          }
        },
      )
      await t.test(
        'preview is read-only; concurrent confirm retries preserve one version, audit and Outbox',
        async () => {
          const proposal = (await preview().expect(200)).body
          assert.equal(proposal.status, 'READY')
          assert.equal(
            (await prisma.match.findUniqueOrThrow({ where: { id: target.id } })).homeTeamId,
            null,
          )
          confirmedHash = proposal.sourceHash
          const body = {
            ruleVersionId: rule.id,
            expectedVersion: proposal.version,
            sourceHash: proposal.sourceHash,
            reason: 'FICTIONAL_TEST first confirmation',
          }
          const key = `confirm-${randomUUID()}`
          successKey = key
          successCommand = body
          const responses = await Promise.all([confirm(body, key), confirm(body, key)])
          assert.ok(responses.some((response) => response.status === 200))
          assert.ok(
            responses.every((response) => response.status === 200 || response.status === 409),
          )
          const replay = await confirm(body, key).expect(200)
          successResponse = replay.body as Record<string, unknown>
          assert.equal(replay.body.version, 1)
          assert.equal(
            await prisma.tournamentProgression.count({ where: { tournamentId: tournament.id } }),
            1,
          )
          assert.equal(
            await prisma.auditLog.count({
              where: { targetId: tournament.id, action: 'TOURNAMENT_PROGRESSION_CONFIRMED' },
            }),
            1,
          )
          assert.equal(
            await prisma.outboxJob.count({
              where: { aggregateId: tournament.id, eventType: 'TournamentProgressionConfirmed' },
            }),
            1,
          )
          const final = await prisma.match.findUniqueOrThrow({ where: { id: target.id } })
          assert.equal(final.homeTeamId, teams[1]!.id)
          assert.equal(final.awayTeamId, teams[0]!.id)
          await confirm({ ...body, reason: 'changed contents' }, key).expect(409)
          await assert.rejects(
            prisma.tournamentProgression.updateMany({
              where: { tournamentId: tournament.id },
              data: { reason: 'attempted mutation' },
            }),
          )
        },
      )
      await t.test(
        'new draft keeps old official facts; correction invalidates old preview and bypasses stale cache',
        async () => {
          await prisma.matchReportRevision.create({
            data: {
              organizationId: org.id,
              matchId: source.id,
              version: 3,
              status: 'DRAFT',
              action: 'CORRECT',
              fields: {
                outcome: 'FINISHED',
                homeScore: '8',
                awayScore: '0',
                _matchContext: {
                  organizationId: org.id,
                  matchId: source.id,
                  tournamentId: tournament.id,
                  stageId: sourceStage.id,
                  groupId: group.id,
                  roundId: null,
                  homeTeamId: teams[0]!.id,
                  awayTeamId: teams[1]!.id,
                  scheduledStartAt: source.scheduledStartAt!.toISOString(),
                },
              },
              homeRosterSnapshotId: snapshots[0]!,
              awayRosterSnapshotId: snapshots[1]!,
              ruleVersionId: rule.id,
              createdByUserId: admin.id,
              reason: 'FICTIONAL_TEST draft',
            },
          })
          await prisma.match.update({ where: { id: source.id }, data: { reportVersion: 3 } })
          assert.equal((await read().expect(200)).body.confirmedResults[0].revision, 2)
          const corrected = await confirmation(4, '4', '0')
          await event(corrected.id, 4)
          const latest = (await read().expect(200)).body
          assert.equal(latest.confirmedResults[0].revision, 4)
          assert.equal(latest.confirmedResults[0].homeScore, 4)
          assert.equal(
            (
              await prisma.matchResultProjection.findUniqueOrThrow({
                where: { organizationId_matchId: { organizationId: org.id, matchId: source.id } },
              })
            ).sourceReportVersion,
            2,
          )
          await confirm(
            {
              ruleVersionId: rule.id,
              expectedVersion: 1,
              sourceHash: confirmedHash,
              reason: 'FICTIONAL_TEST stale',
            },
            randomUUID(),
          ).expect(409)
          await assert.rejects(
            prisma.matchReportRevision.update({
              where: { id: corrected.id },
              data: { reason: 'attempted mutation' },
            }),
          )
        },
      )
      await t.test(
        'forfeit uses the bound award and VOID never becomes an automatic qualifier',
        async () => {
          const forfeitedRevision = await confirmation(5, '0', '3', 'HOME_FORFEIT')
          const forfeitedJob = await event(forfeitedRevision.id, 5)
          worker = createWorkerRuntime(
            { ...process.env, DATABASE_URL: databaseUrl, WORKER_POLL_MS: '100' },
            (code) => workerErrors.push(code),
          )
          await worker.start()
          const deadline = Date.now() + 5000
          while (
            Date.now() < deadline &&
            (await prisma.outboxJob.findUniqueOrThrow({ where: { id: forfeitedJob.id } }))
              .status !== 'SUCCEEDED'
          )
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 50)
            })
          await worker.stop()
          worker = undefined
          const projectedAward = await prisma.matchResultProjection.findUniqueOrThrow({
            where: { organizationId_matchId: { organizationId: org.id, matchId: source.id } },
          })
          assert.equal((projectedAward.payload as Record<string, unknown>).homeScore, 0)
          assert.equal((projectedAward.payload as Record<string, unknown>).awayScore, 3)
          const forfeited = (await read().expect(200)).body
          assert.equal(forfeited.confirmedResults[0].homeScore, 0)
          assert.equal(forfeited.confirmedResults[0].awayScore, 3)
          assert.equal(forfeited.groups[0].standings.rows[0].teamId, teams[1]!.id)
          await confirmation(6, '', '', 'ABANDONED')
          const abandoned = (await read().expect(200)).body
          assert.equal(abandoned.confirmedResults[0].status, 'VOID')
          assert.ok(
            abandoned.groups[0].standings.rows.every((row: { played: number }) => row.played === 0),
          )
          const proposal = (await preview().expect(200)).body
          assert.ok(proposal.reasons.includes('SOURCE_VOID'))
          await confirmation(7, '4', '0')
        },
      )
      await t.test(
        'a target with an explicitly bound match lineup cannot silently change teams',
        async () => {
          await prisma.teamLineupPlan.create({
            data: {
              organizationId: org.id,
              teamId: teams[1]!.id,
              tournamentId: tournament.id,
              matchId: target.id,
              rosterSnapshotId: snapshots[1]!,
              name: 'FICTIONAL_TEST Newly Saved Bound Lineup',
              kind: 'MATCH_LINEUP',
              version: 0,
              payload: { format: 11, formation: '4-3-3', slots: [], benchPlayerIds: [] },
            },
          })
          const proposal = (await preview().expect(200)).body
          assert.ok(proposal.reasons.includes('TARGET_LINEUP_ALREADY_BOUND'))
          await confirm(
            {
              ruleVersionId: rule.id,
              expectedVersion: 1,
              sourceHash: proposal.sourceHash,
              reason: 'FICTIONAL_TEST preserve bound lineup',
            },
            randomUUID(),
          ).expect(409)
        },
      )
      await t.test(
        'frozen match context drift rejects projection and progression instead of reusing old content',
        async () => {
          const revision = await prisma.matchReportRevision.findUniqueOrThrow({
            where: { matchId_version: { matchId: source.id, version: 7 } },
          })
          await prisma.match.update({
            where: { id: source.id },
            data: { scheduledStartAt: new Date('2026-10-02T10:00:00Z') },
          })
          try {
            await read().expect(409)
            await preview().expect(409)
            const job = await event(revision.id, 7)
            worker = createWorkerRuntime(
              { ...process.env, DATABASE_URL: databaseUrl, WORKER_POLL_MS: '100' },
              (code) => workerErrors.push(code),
            )
            await worker.start()
            const deadline = Date.now() + 5000
            while (
              Date.now() < deadline &&
              (await prisma.outboxJob.findUniqueOrThrow({ where: { id: job.id } })).status !==
                'FAILED_PERMANENT'
            )
              await new Promise<void>((resolve) => {
                setTimeout(resolve, 50)
              })
            await worker.stop()
            worker = undefined
            const failed = await prisma.outboxJob.findUniqueOrThrow({ where: { id: job.id } })
            assert.equal(failed.status, 'FAILED_PERMANENT')
            assert.equal(failed.lastErrorCode, 'CONFIRMED_MATCH_CONTEXT_CHANGED')
            assert.equal(
              (
                await prisma.matchResultProjection.findUniqueOrThrow({
                  where: { organizationId_matchId: { organizationId: org.id, matchId: source.id } },
                })
              ).sourceReportVersion,
              5,
            )
            const replay = await confirm(successCommand, successKey).expect(200)
            assert.deepEqual(replay.body, successResponse)
          } finally {
            await prisma.match.update({
              where: { id: source.id },
              data: { scheduledStartAt: source.scheduledStartAt },
            })
          }
        },
      )
      await t.test(
        'started or reported target blocks replacement; role revocation applies to the same token',
        async () => {
          await prisma.match.update({ where: { id: target.id }, data: { status: 'LIVE' } })
          let proposal = (await preview().expect(200)).body
          assert.equal(proposal.status, 'BLOCKED')
          await confirm(
            {
              ruleVersionId: rule.id,
              expectedVersion: 1,
              sourceHash: proposal.sourceHash,
              reason: 'FICTIONAL_TEST started target',
            },
            randomUUID(),
          ).expect(409)
          await prisma.match.update({
            where: { id: target.id },
            data: { status: 'SCHEDULED', reportVersion: 1 },
          })
          proposal = (await preview().expect(200)).body
          assert.ok(proposal.reasons.includes('TARGET_ALREADY_STARTED_OR_REPORTED'))
          const replay = await confirm(successCommand, successKey).expect(200)
          assert.deepEqual(replay.body, successResponse)
          assert.equal(
            await prisma.tournamentProgression.count({ where: { tournamentId: tournament.id } }),
            1,
          )
          assert.equal(
            (await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } }))
              .progressionVersion,
            1,
          )
          assert.equal(
            await prisma.outboxJob.count({
              where: { aggregateId: tournament.id, eventType: 'TournamentProgressionConfirmed' },
            }),
            1,
          )
          assert.equal(
            await prisma.auditLog.count({
              where: { targetId: tournament.id, action: 'TOURNAMENT_PROGRESSION_CONFIRMED' },
            }),
            1,
          )
          await prisma.roleAssignment.update({
            where: { id: adminRole.id },
            data: { revokedAt: new Date() },
          })
          await preview().expect(403)
        },
      )
      await t.test(
        'a newly published rule cannot retroactively reinterpret a differently bound confirmation',
        async () => {
          const changedRule = await prisma.competitionRuleVersion.create({
            data: {
              organizationId: org.id,
              tournamentId: tournament.id,
              version: 2,
              name: 'FICTIONAL_TEST Changed Rules',
              rules: rule.rules as Prisma.InputJsonValue,
            },
          })
          await read().expect(422)
          const proposal = await request(server)
            .post(`/api/admin/tournaments/${tournament.id}/progression/preview`)
            .set('authorization', scopedToken)
            .send({ ruleVersionId: changedRule.id })
            .expect(200)
          assert.equal(proposal.body.status, 'BLOCKED')
          assert.ok(proposal.body.reasons.includes('CONFIRMED_RULE_VERSION_MISMATCH'))
        },
      )
    } finally {
      await worker?.stop()
      await app?.close()
      await prisma.$disconnect()
      // The histories and locked snapshots are immutable; retain scoped fixture until the disposable DB is removed.
    }
  },
)
