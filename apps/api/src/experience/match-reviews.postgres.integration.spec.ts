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
  'match reviews HTTP: independent comments, immutable ratings, distribution and concurrent submissions',
  { timeout: 60000 },
  async () => {
    const url = process.env.TEST_DATABASE_URL
    assert.ok(url, 'Requires an isolated TEST_DATABASE_URL; this test cannot skip')
    assert.match(new URL(url).pathname, /(?:^|_)test(?:_|$)/)
    assert.notEqual(url, process.env.DATABASE_URL, 'Never write to the daily application database')
    const prisma = new PrismaClient({ datasources: { db: { url } } })
    const previousFixtureOrganization = process.env.DEMO_FIXTURE_ORGANIZATION_ID
    const suffix = randomUUID().slice(0, 8)
    const org = await prisma.organization.create({
      data: { slug: `review-test-${suffix}`, name: 'FICTIONAL_TEST 评分组织' },
    })
    const foreign = await prisma.organization.create({
      data: { slug: `review-foreign-${suffix}`, name: 'FICTIONAL_TEST 其它组织' },
    })
    process.env.DEMO_FIXTURE_ORGANIZATION_ID = org.id
    const season = await prisma.season.create({
      data: { organizationId: org.id, seasonCode: suffix, name: 'FICTIONAL_TEST 赛季' },
    })
    const tournament = await prisma.tournament.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        tournamentCode: 'DEMO-GREEN-CUP-2026',
        name: 'FICTIONAL_TEST 比赛',
        status: 'PUBLISHED',
      },
    })
    const match = await prisma.match.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        matchCode: suffix,
        title: 'FICTIONAL_TEST 已结束比赛',
        status: 'FINISHED',
      },
    })
    const future = await prisma.match.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        matchCode: `future-${suffix}`,
        title: 'FICTIONAL_TEST 未开始比赛',
        status: 'SCHEDULED',
      },
    })
    const password = `Fixture-${suffix}!`
    const credential = await hashPassword(password)
    const users = await Promise.all(
      [0, 1, 2, 3].map((index) =>
        prisma.user.create({
          data: {
            displayName: `FICTIONAL_TEST 评论人${index}`,
            loginNameNormalized: `review-${suffix}-${index}`,
            memberships: {
              create: { organizationId: index === 3 ? foreign.id : org.id, status: 'ACTIVE' },
            },
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
            .set('x-organization-id', index === 3 ? foreign.id : org.id)
            .send({ username: user.loginNameNormalized, password })
            .expect(200)
          return `Bearer ${login.body.accessToken}`
        }),
      )
      const post = (index: number, body: object, id = match.id) =>
        request(server)
          .post(`/api/matches/${id}/reviews`)
          .set('Authorization', auth[index]!)
          .send(body)
      const commentResponse = await post(0, { body: '先评论，没有评分' })
      assert.equal(commentResponse.status, 200, JSON.stringify(commentResponse.body))
      const comment = commentResponse.body
      assert.equal(comment.reviews.ratingCount, 0)
      assert.equal(comment.reviews.averageRating, null)
      assert.equal(comment.reviews.comments[0].body, '先评论，没有评分')
      const first = (await post(0, { rating: 4 }).expect(200)).body
      assert.equal(first.reviews.ratingCount, 1)
      assert.equal(first.reviews.viewerReview.rating, 4)
      assert.equal(first.reviews.comments[0].body, '先评论，没有评分')
      await post(0, { rating: 4 }).expect(200)
      await post(0, { rating: 2 }).expect(409)
      const updated = (await post(0, { body: '评分后补充评论' }).expect(200)).body
      assert.equal(updated.reviews.viewerReview.rating, 4)
      assert.equal(updated.reviews.comments.length, 1)
      await post(1, { rating: 1 }).expect(200)
      const racing = await Promise.all([post(2, { rating: 2 }), post(2, { rating: 5 })])
      assert.deepEqual(racing.map((response) => response.status).sort(), [200, 409])
      const read = await request(server)
        .get(`/api/public/matches/${match.id}/experience`)
        .set('Authorization', auth[0]!)
        .set('x-organization-id', org.id)
        .expect(200)
      assert.equal(read.body.reviews.ratingCount, 3)
      assert.equal(
        read.body.reviews.ratingDistribution.reduce(
          (sum: number, item: { count: number }) => sum + item.count,
          0,
        ),
        3,
      )
      assert.equal(
        read.body.reviews.ratingDistribution.find((item: { rating: number }) => item.rating === 4)
          .count,
        1,
      )
      await post(0, {}).expect(400)
      await post(0, { rating: 0 }).expect(400)
      await post(0, { rating: null }).expect(400)
      await post(0, { body: 'x'.repeat(501) }).expect(400)
      await post(0, { rating: 3 }, future.id).expect(400)
      await post(3, { rating: 3 }).expect(404)
      await request(server).post(`/api/matches/${match.id}/reviews`).send({ rating: 3 }).expect(401)
      assert.equal(await prisma.matchReview.count({ where: { matchId: match.id } }), 3)
    } finally {
      if (previousFixtureOrganization === undefined) delete process.env.DEMO_FIXTURE_ORGANIZATION_ID
      else process.env.DEMO_FIXTURE_ORGANIZATION_ID = previousFixtureOrganization
      await app.close()
      await prisma.matchReview.deleteMany({ where: { organizationId: org.id } })
      await prisma.match.deleteMany({ where: { organizationId: org.id } })
      await prisma.tournament.delete({ where: { id: tournament.id } })
      await prisma.season.delete({ where: { id: season.id } })
      await prisma.auditLog.deleteMany({
        where: { actorUserId: { in: users.map((user) => user.id) } },
      })
      await prisma.userSession.deleteMany({
        where: { userId: { in: users.map((user) => user.id) } },
      })
      await prisma.organizationMembership.deleteMany({
        where: { userId: { in: users.map((user) => user.id) } },
      })
      await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } })
      await prisma.organization.deleteMany({ where: { id: { in: [org.id, foreign.id] } } })
      await prisma.$disconnect()
    }
  },
)
