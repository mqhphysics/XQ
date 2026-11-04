import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaClient } from '../generated/prisma/client'
import { seedDemoFixture } from '../database/seed-demo-fixture'
import type { GettingStartedResponseDto } from './getting-started.dto'

test(
  'FICTIONAL_TEST: self association and fixed captain inheritance precede the first-use guide',
  { timeout: 120000 },
  async (t) => {
    const database = process.env.TEST_DATABASE_URL
    if (!database) {
      t.skip('Requires an independent TEST_DATABASE_URL')
      return
    }
    assert.match(new URL(database).pathname, /getting_started_test/)
    process.env.DATABASE_URL = database
    const db = new PrismaClient({ datasources: { db: { url: database } } })
    await seedDemoFixture(db)
    const org = '00000000-0000-4000-8000-000000000001'
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    configureApp(app)
    await app.listen(0, '127.0.0.1')
    const base = await app.getUrl(),
      path = '/api/me/getting-started'
    async function call(
      method: string,
      route: string,
      status: number,
      token?: string,
      body?: unknown,
    ) {
      const res = await fetch(base + route, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-organization-id': org,
          ...(token ? { authorization: 'Bearer ' + token } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const text = await res.text(),
        data = text ? JSON.parse(text) : {}
      assert.equal(res.status, status, JSON.stringify(data))
      return data
    }
    try {
      const student = await call('POST', '/api/auth/login', 200, undefined, {
          username: 'student',
          password: 'Xiaoqiu2026!',
        }),
        token = student.accessToken as string,
        userId = student.user.id as string
      await db.user.update({
        where: { id: userId },
        data: {
          studentRecordId: null,
          playerProfileId: null,
          studentId: '2026000001',
          realName: 'TEST SELF PLAYER',
          studentVerifiedAt: null,
          onboardingCompletedAt: null,
        },
      })
      const record = await db.studentRecord.create({
        data: {
          organizationId: org,
          realName: 'TEST SELF PLAYER',
          sourceType: 'DEMO_FIXTURE',
          isDemo: true,
        },
      })
      const player = await db.playerProfile.create({
        data: {
          organizationId: org,
          displayName: 'TEST SELF PLAYER',
          studentRecordId: record.id,
          sourceType: 'DEMO_FIXTURE',
          sourceKey: 'getting-started-test',
          isDemo: true,
        },
      })
      const matches = await db.match.findMany({
        where: { organizationId: org, homeTeamId: { not: null }, awayTeamId: { not: null } },
        take: 2,
      })
      const recent = matches[0]!,
        old = matches[1]!,
        team = recent.homeTeamId!
      await db.teamMembership.create({
        data: { organizationId: org, teamId: team, playerProfileId: player.id, status: 'ACTIVE' },
      })
      await db.roleAssignment.deleteMany({
        where: { organizationId: org, role: 'TEAM_CAPTAIN', scopeType: 'TEAM', scopeId: team },
      })
      await db.match.update({
        where: { id: recent.id },
        data: { scheduledStartAt: new Date('2026-10-26T10:00:00Z'), status: 'FINISHED' },
      })
      await db.match.update({
        where: { id: old.id },
        data: {
          homeTeamId: team,
          scheduledStartAt: new Date('2026-10-20T10:00:00Z'),
          status: 'FINISHED',
        },
      })
      const other = await db.playerProfile.findFirstOrThrow({
        where: { organizationId: org, id: { not: player.id } },
      })
      const fact = async (match: typeof recent, captain: string, createdAt: Date) =>
        db.auditLog.create({
          data: {
            organizationId: org,
            actorType: 'ADMIN',
            action: 'MATCH_DOCUMENT_LINEUP_RECORDED',
            targetType: 'Match',
            targetId: match.id,
            source: 'OFFICIAL_MATCH_DOCUMENT',
            requestId: randomUUID(),
            reason: 'FICTIONAL_TEST confirmed sheet',
            createdAt,
            afterSummary: {
              matchId: match.id,
              teamId: team,
              tournamentId: match.tournamentId,
              lineup: { captainPlayerId: captain },
            },
          },
        })
      await fact(recent, player.id, new Date('2026-10-26T12:00:00Z'))
      await fact(old, other.id, new Date('2026-10-27T12:00:00Z'))
      await t.test(
        'read is authenticated, matching accepts an unverified directory record without completing the guide',
        async () => {
          await call('GET', path, 401)
          await call('POST', path + '/match', 400, token, { clientActionId: 'bad' })
          const data = (await call('POST', path + '/match', 200, token, {
            clientActionId: randomUUID(),
          })) as GettingStartedResponseDto
          assert.deepEqual(
            data.players.map((p) => p.id),
            [player.id],
          )
          assert.equal(data.completed, false)
          assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: userId } })).onboardingCompletedAt,
            null,
          )
        },
      )
      await t.test(
        'self confirmation grants the fixed captain of the latest match once, before any tutorial',
        async () => {
          await call('POST', path + '/player', 409, token, {
            clientActionId: randomUUID(),
            playerId: other.id,
          })
          const body = { clientActionId: randomUUID(), playerId: player.id }
          const data = (await call(
            'POST',
            path + '/player',
            200,
            token,
            body,
          )) as GettingStartedResponseDto
          assert.equal(data.user.linkedPlayer?.id, player.id)
          assert.equal(data.completed, false)
          assert.ok(
            data.user.roles.some((role) => role.role === 'TEAM_CAPTAIN' && role.scopeId === team),
          )
          assert.deepEqual(
            data.captainTeams.map((t) => t.id),
            [team],
          )
          await call('POST', path + '/player', 200, token, body)
          assert.equal(
            await db.auditLog.count({
              where: { organizationId: org, actorUserId: userId, action: 'TEAM_CAPTAIN_INHERITED' },
            }),
            1,
          )
          assert.equal(
            (await db.studentRecord.findUniqueOrThrow({ where: { id: record.id } })).studentNumber,
            null,
          )
          assert.equal(
            await db.identityApplication.count({
              where: { organizationId: org, userId, kind: 'TEAM_CAPTAIN' },
            }),
            0,
          )
        },
      )
      await t.test(
        'an explicit revocation stays revoked; completing or skipping alone saves guide completion',
        async () => {
          await db.roleAssignment.updateMany({
            where: { userId, role: 'TEAM_CAPTAIN', scopeId: team },
            data: { revokedAt: new Date() },
          })
          const result = (await call('POST', path + '/match', 200, token, {
            clientActionId: randomUUID(),
          })) as GettingStartedResponseDto
          assert.equal(result.captainTeams.length, 0)
          assert.ok(
            !result.user.roles.some(
              (role) => role.role === 'TEAM_CAPTAIN' && role.scopeId === team,
            ),
          )
          await call('POST', path + '/complete', 200, token, {
            clientActionId: randomUUID(),
            outcome: 'SKIPPED',
          })
          assert.equal((await call('GET', path, 200, token)).completed, true)
        },
      )
      await t.test(
        'a valid number never selects a different known number merely by name',
        async () => {
          await db.user.update({
            where: { id: userId },
            data: { playerProfileId: null, studentRecordId: null },
          })
          await db.studentRecord.update({
            where: { id: record.id },
            data: { studentNumber: '2026000002' },
          })
          assert.equal((await call('GET', path, 200, token)).players.length, 0)
          await db.studentRecord.update({ where: { id: record.id }, data: { studentNumber: null } })
          const duplicate = await db.studentRecord.create({
            data: {
              organizationId: org,
              realName: 'TEST SELF PLAYER',
              sourceType: 'DEMO_FIXTURE',
              isDemo: true,
              player: {
                create: {
                  organizationId: org,
                  displayName: 'TEST SECOND PLAYER',
                  sourceType: 'DEMO_FIXTURE',
                  sourceKey: 'getting-started-duplicate',
                  isDemo: true,
                },
              },
            },
          })
          assert.equal((await call('GET', path, 200, token)).players.length, 2)
          assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: userId } })).playerProfileId,
            null,
          )
          assert.ok(duplicate.id)
        },
      )
    } finally {
      await app.close()
      await db.$disconnect()
    }
  },
)
