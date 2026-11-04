import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { NestFactory } from '@nestjs/core'
import {
  technicalSummary,
  technicalTotals,
  emptyTechnicalTotals,
  type TechnicalOperation,
} from '@xiaoqiu/contracts'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaClient } from '../generated/prisma/client'
import { seedDemoFixture } from '../database/seed-demo-fixture'

test(
  'FICTIONAL_TEST: technical statistics persist via real HTTP without changing official results',
  { timeout: 120000 },
  async (t) => {
    const database = process.env.TEST_DATABASE_URL
    assert.ok(database, 'A dedicated TEST_DATABASE_URL is required')
    assert.match(new URL(database).pathname, /technical_test/)
    process.env.DATABASE_URL = database
    const db = new PrismaClient({ datasources: { db: { url: database } } })
    await seedDemoFixture(db)
    const org = '00000000-0000-4000-8000-000000000001'
    const tournament = await db.tournament.findFirstOrThrow({
      where: { organizationId: org, tournamentCode: 'DEMO-GREEN-CUP-2026' },
    })
    const match = await db.match.findFirstOrThrow({
      where: {
        organizationId: org,
        tournamentId: tournament.id,
        homeTeamId: { not: null },
        awayTeamId: { not: null },
      },
    })
    await db.match.update({
      where: { id: match.id },
      data: { scheduledStartAt: new Date(), status: 'LIVE' },
    })
    const factsBefore = await db.match.findUnique({
      where: { id: match.id },
      select: { homeScore: true, awayScore: true, confirmedReportVersion: true },
    })
    const eventsBefore = await db.matchEvent.count({ where: { matchId: match.id } })
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    configureApp(app)
    await app.listen(0, '127.0.0.1')
    const base = await app.getUrl(),
      path = `/api/matches/${match.id}/technical-statistics`
    async function call(
      method: string,
      endpoint: string,
      expected: number,
      token?: string,
      body?: unknown,
    ) {
      const response = await fetch(base + endpoint, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-organization-id': org,
          ...(token ? { authorization: 'Bearer ' + token } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const text = await response.text()
      const data = (text ? JSON.parse(text) : {}) as {
        version: number
        operations: TechnicalOperation[]
        canRecord: boolean
        teams: Array<{
          id: string
          players: Array<{
            id: string
            avatarUrl?: string | null
            position?: string | null
            starter?: boolean | null
          }>
        }>
        accessToken: string
        user: { id: string }
      }
      assert.equal(response.status, expected, JSON.stringify(data))
      return data
    }
    try {
      const login = async (username: string) =>
        (await call('POST', '/api/auth/login', 200, undefined, {
          username,
          password: 'Xiaoqiu2026!',
        })) as { accessToken: string; user: { id: string } }
      const reporter = await login('reporter'),
        admin = await login('admin'),
        student = await login('student')
      const op = (metric = 'PASS', outcome = 'SUCCESS') => ({
        id: randomUUID(),
        kind: 'COUNT',
        teamId: match.homeTeamId,
        playerId: null,
        metric,
        outcome,
        occurredAt: new Date().toISOString(),
      })
      await t.test(
        'recorder rosters include uploaded portraits, positions and confirmed-lineup state',
        async () => {
          const initial = await call('GET', path, 200, reporter.accessToken)
          const player = initial.teams[0]?.players[0]
          assert.ok(player)
          await db.playerProfile.update({
            where: { id: player.id },
            data: {
              avatarUrl: null,
              portraitUrl: 'https://images.example.invalid/technical-player.jpg',
              position: 'MIDFIELDER',
            },
          })
          const updated = await call('GET', path, 200, reporter.accessToken)
          const actual = updated.teams[0]?.players.find((row) => row.id === player.id)
          assert.equal(actual?.avatarUrl, 'https://images.example.invalid/technical-player.jpg')
          assert.ok(
            ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD'].includes(actual?.position || ''),
          )
          assert.ok(actual?.starter === null || typeof actual?.starter === 'boolean')
        },
      )
      await t.test('authorization, empty body and foreign objects are rejected', async () => {
        await call('GET', path, 401)
        await call('GET', path, 403, student.accessToken)
        await call('POST', path, 400, reporter.accessToken, { expectedVersion: 0, operations: [] })
        await call('POST', path, 400, reporter.accessToken, {
          expectedVersion: 0,
          operations: [{ ...op(), teamId: randomUUID() }],
        })
        await call('POST', path, 400, reporter.accessToken, {
          expectedVersion: 0,
          operations: [{ ...op(), playerId: randomUUID() }],
        })
        await call(
          'GET',
          `/api/matches/${randomUUID()}/technical-statistics`,
          404,
          reporter.accessToken,
        )
      })
      let version = 0
      const shot = op('SHOT', 'ATTEMPT'),
        pass = op(),
        goal = {
          id: randomUUID(),
          kind: 'GOAL',
          shotId: shot.id,
          occurredAt: new Date().toISOString(),
        }
      await t.test('save, JSONB idempotent retry, readback and goal annotation', async () => {
        let data = await call('POST', path, 200, reporter.accessToken, {
          expectedVersion: 0,
          operations: [pass, shot, goal],
        })
        version = data.version
        assert.equal(technicalSummary(data.operations, match.homeTeamId!)[3]!.total, 1)
        assert.equal(technicalSummary(data.operations, match.homeTeamId!)[3]!.goals, 1)
        data = await call('POST', path, 200, reporter.accessToken, {
          expectedVersion: 0,
          operations: [pass, shot, goal],
        })
        assert.equal(data.version, version)
        assert.equal(data.operations.length, 3)
        const read = await call('GET', path, 200, reporter.accessToken)
        assert.equal(read.operations.length, 3)
        await call('POST', path, 409, reporter.accessToken, {
          expectedVersion: version,
          operations: [{ ...pass, outcome: 'FAILURE' }],
        })
        await call('POST', path, 409, reporter.accessToken, {
          expectedVersion: version,
          operations: [{ ...goal, id: randomUUID() }],
        })
      })
      await t.test(
        'undo persists, stale version conflicts and another recorder stays separate',
        async () => {
          const undo = {
            id: randomUUID(),
            kind: 'UNDO',
            targetId: goal.id,
            occurredAt: new Date().toISOString(),
          }
          const data = await call('POST', path, 200, reporter.accessToken, {
            expectedVersion: version,
            operations: [undo],
          })
          version = data.version
          assert.equal(technicalSummary(data.operations, match.homeTeamId!)[3]!.goals, 0)
          await call('POST', path, 409, reporter.accessToken, {
            expectedVersion: 0,
            operations: [op()],
          })
          const other = await call('GET', path, 200, admin.accessToken)
          assert.equal(other.version, 0)
          assert.deepEqual(other.operations, [])
          await call('POST', path, 409, reporter.accessToken, {
            expectedVersion: version,
            operations: [{ ...undo, id: randomUUID(), targetId: pass.id }],
          })
        },
      )
      await t.test(
        'v2 outcomes and bulk summaries persist without duplicate team attribution',
        async () => {
          const v2path = path + '?schemaVersion=2'
          let data = await call('POST', path, 200, reporter.accessToken, {
            schemaVersion: 2,
            expectedVersion: version,
            operations: [
              op('SHOT', 'ON_TARGET'),
              op('SHOT', 'OFF_TARGET'),
              op('SHOT', 'GOAL'),
              op('FOUL', 'FOUL'),
              op('FOUL', 'YELLOW_CARD'),
              op('FOUL', 'RED_CARD'),
              op('CHANCE', 'SUCCESS'),
              op('CHANCE', 'FAILURE'),
            ],
          })
          version = data.version
          let totals = technicalTotals(data.operations, match.homeTeamId!)
          assert.equal(totals.shotsOnTarget, 2)
          assert.equal(totals.shotsOffTarget, 1)
          assert.equal(totals.goals, 1)
          assert.equal(totals.fouls, 1)
          assert.equal(totals.yellowCards, 1)
          assert.equal(totals.redCards, 1)
          assert.equal(totals.chancesCreated, 1)
          assert.equal(totals.chancesMissed, 1)
          await call('GET', path, 409, reporter.accessToken)
          const read = await call('GET', v2path, 200, reporter.accessToken),
            player = read.teams.find((t) => t.id === match.homeTeamId)!.players[0]!.id
          const snapshot = (
            playerId: string | null,
            passSuccess: number,
            base = emptyTechnicalTotals(),
          ) => ({
            id: randomUUID(),
            kind: 'SET_TOTALS',
            teamId: match.homeTeamId,
            playerId,
            occurredAt: new Date().toISOString(),
            totals: { ...base, passSuccess },
          })
          const team = snapshot(null, 7, totals),
            individual = snapshot(player, 3)
          data = await call('POST', path, 200, reporter.accessToken, {
            schemaVersion: 2,
            expectedVersion: version,
            operations: [team, individual],
          })
          version = data.version
          assert.equal(technicalTotals(data.operations, match.homeTeamId!).passSuccess, 7)
          assert.equal(technicalTotals(data.operations, match.homeTeamId!, player).passSuccess, 3)
          const retry = await call('POST', path, 200, reporter.accessToken, {
            schemaVersion: 2,
            expectedVersion: version - 1,
            operations: [team, individual],
          })
          assert.equal(retry.version, version)
          await call('POST', path, 409, reporter.accessToken, {
            schemaVersion: 2,
            expectedVersion: version,
            operations: [snapshot(null, 2, totals)],
          })
          const raise = snapshot(player, 5)
          data = await call('POST', path, 200, reporter.accessToken, {
            schemaVersion: 2,
            expectedVersion: version,
            operations: [raise],
          })
          version = data.version
          totals = technicalTotals(data.operations, match.homeTeamId!)
          assert.equal(totals.passSuccess, 7)
          data = await call('POST', path, 200, reporter.accessToken, {
            schemaVersion: 2,
            expectedVersion: version,
            operations: [
              {
                id: randomUUID(),
                kind: 'UNDO',
                targetId: raise.id,
                occurredAt: new Date().toISOString(),
              },
            ],
          })
          version = data.version
          assert.equal(technicalTotals(data.operations, match.homeTeamId!, player).passSuccess, 3)
        },
      )

      await t.test(
        'frozen reporters cannot write and platform administrators do not need a reporter identity',
        async () => {
          await db.reporterProfile.updateMany({
            where: { organizationId: org, userId: reporter.user.id },
            data: { status: 'FROZEN' },
          })
          assert.equal(
            (await call('GET', path + '?schemaVersion=2', 200, reporter.accessToken)).canRecord,
            false,
          )
          await call('POST', path, 403, reporter.accessToken, {
            expectedVersion: version,
            operations: [op()],
          })
          await db.roleAssignment.create({
            data: {
              userId: student.user.id,
              organizationId: null,
              role: 'PLATFORM_ADMIN',
              scopeType: 'PLATFORM',
              scopeId: org,
            },
          })
          const data = await call('POST', path, 200, student.accessToken, {
            expectedVersion: 0,
            operations: [op()],
          })
          assert.equal(data.operations.length, 1)
        },
      )
      await t.test(
        'technical observations leave the official score, result version and goals unchanged',
        async () => {
          assert.deepEqual(
            await db.match.findUnique({
              where: { id: match.id },
              select: { homeScore: true, awayScore: true, confirmedReportVersion: true },
            }),
            factsBefore,
          )
          assert.equal(await db.matchEvent.count({ where: { matchId: match.id } }), eventsBefore)
          assert.ok(
            (await db.auditLog.count({
              where: { organizationId: org, action: 'MATCH_TECHNICAL_RECORDED' },
            })) > 0,
          )
        },
      )
      await t.test('revoked sessions cannot access a saved private record', async () => {
        await call('POST', '/api/auth/logout', 204, reporter.accessToken)
        await call('GET', path, 401, reporter.accessToken)
      })
    } finally {
      await app.close()
      await db.$disconnect()
    }
  },
)
