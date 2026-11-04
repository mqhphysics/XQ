import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaClient } from '../generated/prisma/client'
import { seedDemoFixture } from '../database/seed-demo-fixture'
test(
  'FICTIONAL_TEST: referee profiles count completed appointments and allow only self biography edits',
  { timeout: 120000 },
  async (t) => {
    const database = process.env.TEST_DATABASE_URL
    if (!database) {
      t.skip('Requires independent TEST_DATABASE_URL')
      return
    }
    assert.match(new URL(database).pathname, /referee_test/)
    process.env.DATABASE_URL = database
    const db = new PrismaClient({ datasources: { db: { url: database } } })
    await seedDemoFixture(db)
    const org = '00000000-0000-4000-8000-000000000001',
      app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    configureApp(app)
    await app.listen(0, '127.0.0.1')
    const base = await app.getUrl()
    const call = async (
      method: string,
      path: string,
      status: number,
      token?: string,
      body?: unknown,
    ) => {
      const response = await fetch(base + '/api' + path, {
          method,
          headers: {
            'content-type': 'application/json',
            'x-organization-id': org,
            ...(token ? { authorization: 'Bearer ' + token } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        text = await response.text(),
        data = text ? JSON.parse(text) : {}
      assert.equal(response.status, status, JSON.stringify(data))
      return data
    }
    try {
      const login = await call('POST', '/auth/login', 200, undefined, {
          username: 'student',
          password: 'Xiaoqiu2026!',
        }),
        token = login.accessToken as string,
        userId = login.user.id as string
      const student = await db.studentRecord.create({
        data: {
          organizationId: org,
          realName: 'TEST REFEREE',
          isDemo: true,
          sourceType: 'DEMO_FIXTURE',
        },
      })
      await db.user.update({ where: { id: userId }, data: { studentRecordId: student.id } })
      const path = '/public/people/' + userId + '/referee'
      await t.test(
        'ordinary students and future scheduled officials do not gain the referee tab',
        async () => {
          assert.equal((await call('GET', path, 200)).isReferee, false)
          await call('PATCH', '/me/referee-profile', 401, undefined, { bio: 'test' })
          await call('PATCH', '/me/referee-profile', 403, token, { bio: 'test' })
        },
      )
      const matches = await db.match.findMany({
          where: { organizationId: org, homeTeamId: { not: null } },
          take: 2,
        }),
        past = matches[0]!,
        future = matches[1]!
      await db.match.update({
        where: { id: past.id },
      data: { status: 'FINISHED', reportVersion:Math.max(1,past.reportVersion),confirmedReportVersion: 1 },
      })
      await db.match.update({
        where: { id: future.id },
        data: { status: 'SCHEDULED', scheduledStartAt: new Date(Date.now() + 86400000) },
      })
      const assigned = async (matchId: string, role: string) =>
        db.auditLog.create({
          data: {
            organizationId: org,
            actorType: 'ADMIN',
            action: 'MATCH_OFFICIALS_RECORDED',
            source: 'OFFICIAL_MATCH_DOCUMENT',
            targetType: 'Match',
            targetId: matchId,
            requestId: randomUUID(),
            afterSummary: { matchId, officials: [{ studentRecordId: student.id, role }] },
          },
        })
      await assigned(future.id, 'REFEREE')
      assert.equal((await call('GET', path, 200)).isReferee, false)
      await assigned(past.id, 'REFEREE')
      const before = await db.matchEvent.count({ where: { matchId: past.id, type: 'YELLOW_CARD' } })
      await db.matchEvent.create({
        data: {
          organizationId: org,
          matchId: past.id,
          teamId: past.homeTeamId!,
          type: 'YELLOW_CARD',
          minute: 3,
        },
      })
      await t.test(
        'completed main referee appointments have real card counts and stable person links',
        async () => {
          const profile = await call('GET', path, 200)
          assert.equal(profile.isReferee, true)
          assert.equal(profile.totalMatches, 1)
          assert.equal(profile.refereeMatches, 1)
          assert.equal(profile.yellowCards, before + 1)
          const people = await call('GET', '/public/matches/' + past.id + '/referee-people', 200)
          assert.equal(people.items[0].userId, userId)
          assert.ok(!('studentRecordId' in people.items[0]))
        },
      )
      await t.test(
        'biography is separately saved and invalid input or cross-organization objects are rejected',
        async () => {
          await call('PATCH', '/me/referee-profile', 400, token, { bio: 'x'.repeat(501) })
          assert.equal(
            (await call('PATCH', '/me/referee-profile', 200, token, { bio: 'TEST calm and clear' }))
              .bio,
            'TEST calm and clear',
          )
          assert.equal((await call('GET', path, 200)).bio, 'TEST calm and clear')
          await call('GET', '/public/people/' + randomUUID() + '/referee', 404)
        },
      )
      await t.test(
        'a corrected latest appointment replaces the old role instead of double counting',
        async () => {
          await assigned(past.id, 'ASSISTANT_REFEREE_1')
          const data = await call('GET', path, 200)
          assert.equal(data.totalMatches, 1)
          assert.equal(data.refereeMatches, 0)
          assert.equal(data.assistantMatches, 1)
          assert.equal(data.yellowCards, 0)
        },
      )
    } finally {
      await app.close()
      await db.$disconnect()
    }
  },
)
