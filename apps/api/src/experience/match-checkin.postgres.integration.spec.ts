import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'
import { hashPassword } from '../auth/password'

test(
  'check-in real HTTP: persistence, concurrent retries, account isolation and retired UGC',
  { timeout: 60000 },
  async () => {
    const url = process.env.TEST_DATABASE_URL
    assert.ok(url, 'An isolated TEST_DATABASE_URL is required')
    const target = new URL(url)
    assert.match(target.pathname, /(?:^|_)test(?:_|$)/)
    if (process.env.DATABASE_URL) {
      const live = new URL(process.env.DATABASE_URL)
      assert.ok(
        target.hostname !== live.hostname ||
          target.port !== live.port ||
          target.pathname !== live.pathname,
      )
    }
    const prisma = new PrismaClient({ datasources: { db: { url } } })
    const suffix = randomUUID().slice(0, 8)
    const org = await prisma.organization.create({
      data: { slug: `checkin-test-${suffix}`, name: 'FICTIONAL_TEST 打卡组织' },
    })
    const foreign = await prisma.organization.create({
      data: { slug: `checkin-foreign-${suffix}`, name: 'FICTIONAL_TEST 其它组织' },
    })
    const season = await prisma.season.create({
      data: { organizationId: org.id, seasonCode: suffix, name: 'FICTIONAL_TEST 赛季' },
    })
    const tournament = await prisma.tournament.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        tournamentCode: suffix,
        name: 'FICTIONAL_TEST 赛事',
        status: 'PUBLISHED',
      },
    })
    await prisma.competitionRuleVersion.create({ data: {
      organizationId: org.id, tournamentId: tournament.id, version: 1,
      name: 'FICTIONAL_TEST 已发布赛事规程', status: 'PUBLISHED',
      rules: { results: {
        points: { win: 3, draw: 1, loss: 0 },
        tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
        headToHead: { criteria: ['POINTS'], reapplyToRemainingTeams: false },
        groupShootout: 'REJECT', knockoutShootout: 'ALLOWED',
        forfeit: { winnerGoals: 3, loserGoals: 0, loserPoints: -1, both: null },
      } },
    } })
    const match = await prisma.match.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        matchCode: suffix,
        title: 'FICTIONAL_TEST 比赛',
        status: 'FINISHED',
      },
    })
    const password = `Test-${suffix}!`
    const credential = await hashPassword(password)
    const users = await Promise.all(
      [org, org, foreign].map((organization, index) =>
        prisma.user.create({
          data: {
            displayName: `FICTIONAL_TEST ${index}`,
            loginNameNormalized: `checkin-${suffix}-${index}`,
            memberships: { create: { organizationId: organization.id, status: 'ACTIVE' } },
            passwordCredential: {
              create: { passwordHash: credential.hash, passwordSalt: credential.salt },
            },
          },
        }),
      ),
    )
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile()
    const app = module.createNestApplication({ logger: false })
    configureApp(app)
    await app.init()
    try {
      const server = app.getHttpServer()
      const auth = await Promise.all(
        users.map(async (user, index) => {
          const login = await request(server)
            .post('/api/auth/login')
            .set('x-organization-id', index === 2 ? foreign.id : org.id)
            .send({ username: user.loginNameNormalized, password })
            .expect(200)
          return `Bearer ${login.body.accessToken}`
        }),
      )
      const endpoint = `/api/matches/${match.id}/check-in`
      const read = (authorization?: string) => {
        const response = request(server)
          .get(`/api/public/matches/${match.id}/check-in`)
          .set('x-organization-id', org.id)
        return authorization ? response.set('Authorization', authorization) : response
      }
      assert.equal((await read().expect(200)).body.count, 0)
      await request(server).put(endpoint).expect(401)
      const repeated = await Promise.all(
        Array.from({ length: 6 }, () =>
          request(server).put(endpoint).set('Authorization', auth[0]!).expect(200),
        ),
      )
      assert.ok(repeated.every((response) => response.body.checkedIn && response.body.count === 1))
      assert.equal(await prisma.matchCheckin.count({ where: { matchId: match.id } }), 1)
      assert.equal((await read(auth[0]).expect(200)).body.checkedIn, true)
      assert.equal((await read(auth[1]).expect(200)).body.checkedIn, false)
      await request(server).put(endpoint).set('Authorization', auth[1]!).expect(200)
      assert.equal((await read().expect(200)).body.count, 2)
      await request(server).put(endpoint).set('Authorization', auth[2]!).expect(404)
      await read(auth[2]).expect(403)
      await request(server)
        .post('/api/community/posts')
        .set('Authorization', auth[0]!)
        .send({ body: 'retired' })
        .expect(410)
      await request(server)
        .post(`/api/matches/${match.id}/reviews`)
        .set('Authorization', auth[0]!)
        .send({ body: 'retired' })
        .expect(410)
      const ratingResponse = await request(server)
        .post(`/api/matches/${match.id}/reviews`)
        .set('Authorization', auth[0]!)
        .send({ rating: 4 })
      assert.equal(ratingResponse.status, 200, JSON.stringify(ratingResponse.body))
      const reopened = new PrismaClient({ datasources: { db: { url } } })
      try {
        assert.equal(await reopened.matchCheckin.count({ where: { matchId: match.id } }), 2)
      } finally {
        await reopened.$disconnect()
      }
    } finally {
      await app.close()
      await prisma.$disconnect()
    }
  },
)
