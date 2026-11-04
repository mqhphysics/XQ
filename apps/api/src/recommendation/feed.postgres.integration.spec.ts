import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaClient } from '../generated/prisma/client'
import { seedDemoFixture } from '../database/seed-demo-fixture'
import { FeedService } from './feed.service'

test(
  'FICTIONAL_TEST: recommendation migration and real HTTP acceptance in a separate database',
  { timeout: 120000 },
  async (t) => {
    const database = process.env.TEST_DATABASE_URL
    assert.ok(database, 'A dedicated TEST_DATABASE_URL is required')
    assert.match(new URL(database).pathname, /test/)
    process.env.DATABASE_URL = database
    const db = new PrismaClient({ datasources: { db: { url: database } } })
    await seedDemoFixture(db)
    const org = '00000000-0000-4000-8000-000000000001'
    const tournament = await db.tournament.findFirstOrThrow({
      where: { organizationId: org, tournamentCode: 'DEMO-GREEN-CUP-2026' },
    })
    process.env.DEFAULT_TOURNAMENT_ID = tournament.id
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    configureApp(app)
    await app.listen(0, '127.0.0.1')
    const base = await app.getUrl()
    const createdPostIds: string[] = []
    type Session = { accessToken: string; user: { id: string } }
    async function call(
      method: string,
      path: string,
      status = 200,
      token?: string,
      body?: unknown,
      organization = org,
    ) {
      const response = await fetch(base + path, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-organization-id': organization,
          ...(token ? { authorization: 'Bearer ' + token } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const data = (await response.json()) as any
      assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
      return { data, headers: response.headers }
    }
    try {
      const login = async (username: string) =>
        (
          await call('POST', '/api/auth/login', 200, undefined, {
            username,
            password: 'Xiaoqiu2026!',
          })
        ).data as Session
      const student = await login('student'),
        captain = await login('captain')
      const ids = Array.from({ length: 31 }, () => randomUUID())
      createdPostIds.push(...ids)
      await db.post.createMany({
        data: ids.map((id, i) => ({
          id,
          organizationId: org,
          tournamentId: tournament.id,
          authorUserId: i % 2 ? student.user.id : captain.user.id,
          publicationSource: 'USER',
          type: 'COMMUNITY' as const,
          status: 'PUBLISHED' as const,
          body: 'FICTIONAL_TEST 推荐验收，球队训练与校园足球故事 ' + i,
        })),
      })
      for (const [session, list] of [
        [student, ids.slice(0, 2)],
        [captain, ids.slice(0, 3)],
      ] as const)
        for (const id of list)
          await call('PUT', '/api/community/posts/' + id + '/like', 200, session.accessToken)
      const feed = async (session: Session | undefined = student, query = '') =>
        (
          await call(
            'GET',
            '/api/public/feed?tournamentId=' + tournament.id + query,
            200,
            session?.accessToken,
          )
        ).data
      let first: any
      const times: Record<string, number | string> = {}
      await t.test(
        'first request stays responsive while actual background training starts',
        async () => {
          const start = performance.now()
          first = await feed()
          times.firstMs = Math.round(performance.now() - start)
          assert(Number(times.firstMs) < 2000)
          for (let i = 0; i < 50 && first.modelState === 'TRAINING'; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100))
            first = await feed()
          }
          assert.equal(first.algorithm, 'interest+lightgcn-bpr-v1')
          assert.equal(first.modelState, 'READY')
          assert.match(first.modelVersion, /^[a-f0-9]{16}$/)
          assert(first.items.length > 0)
          const states = (app.get(FeedService) as any).states as Map<string, any>
          const model = states.get(org + ':' + tournament.id).model
          assert(model.loss.length > 0)
          assert(model.loss.at(-1) < model.loss[0])
          times.trainingMs = states.get(org + ':' + tournament.id).durationMs
          times.trainingSamples = model.edges
        },
      )
      await t.test(
        'stable pagination keeps order, returns full post fields and never repeats IDs',
        async () => {
          const start = performance.now(),
            same = await feed(student, '&batchId=' + first.batchId)
          times.cachedBatchMs = Math.round(performance.now() - start)
          assert.deepEqual(
            same.items.map((p: any) => p.id),
            first.items.map((p: any) => p.id),
          )
          assert.equal(new Set(first.items.map((p: any) => p.id)).size, first.items.length)
          assert(first.nextCursor !== null)
          const next = await feed(
            student,
            '&batchId=' + first.batchId + '&cursor=' + first.nextCursor,
          )
          assert(next.items.every((p: any) => !first.items.some((old: any) => old.id === p.id)))
          assert(
            first.items.every(
              (p: any) => p.author && Array.isArray(p.tags) && typeof p.favoritedByMe === 'boolean',
            ),
          )
        },
      )
      await t.test(
        'guest responses are private and invalid bearer tokens never become guests',
        async () => {
          const guest = await call('GET', '/api/public/feed?tournamentId=' + tournament.id)
          assert.match(guest.headers.get('cache-control')!, /private/)
          assert.match(guest.headers.get('cache-control')!, /no-store/)
          assert.notEqual(guest.data.modelState, 'READY')
          await call(
            'GET',
            '/api/public/feed?tournamentId=' + tournament.id,
            401,
            'not-a-valid-token',
          )
        },
      )
      await t.test(
        'batches cannot be read or written by another user or organization',
        async () => {
          await call('GET', '/api/public/feed?batchId=' + first.batchId, 403, captain.accessToken)
          const event = {
            eventId: randomUUID(),
            postId: first.items[0].id,
            batchId: first.batchId,
            kind: 'READ',
            durationMs: 4200,
          }
          await call('POST', '/api/me/feed-events', 403, captain.accessToken, { events: [event] })
          const foreign = await db.organization.create({
            data: {
              slug: 'fictional-feed-' + randomUUID(),
              name: 'FICTIONAL_TEST foreign organization',
            },
          })
          await call(
            'GET',
            '/api/public/feed?batchId=' + first.batchId,
            403,
            student.accessToken,
            undefined,
            foreign.id,
          )
          const post = await db.post.create({
            data: {
              organizationId: foreign.id,
              body: 'FICTIONAL_TEST foreign content',
              status: 'PUBLISHED',
            },
          })
          assert.equal(
            (
              await call('POST', '/api/me/feed-events', 200, student.accessToken, {
                events: [{ ...event, eventId: randomUUID(), postId: post.id, batchId: undefined }],
              })
            ).data.accepted,
            0,
          )
        },
      )
      const event = {
        eventId: randomUUID(),
        postId: first.items[0].id,
        batchId: first.batchId,
        kind: 'READ',
        durationMs: 4200,
      }
      await t.test('read events persist once with server identity and retry IDs', async () => {
        const start = performance.now(),
          accepted = await call('POST', '/api/me/feed-events', 200, student.accessToken, {
            events: [event],
          })
        times.eventWriteMs = Math.round(performance.now() - start)
        assert.equal(accepted.data.accepted, 1)
        assert.equal(
          (await call('POST', '/api/me/feed-events', 200, student.accessToken, { events: [event] }))
            .data.accepted,
          0,
        )
        const rows = await db.postFeedEvent.findMany({
          where: { userId: student.user.id, clientEventId: event.eventId },
        })
        assert.equal(rows.length, 1)
        assert.equal(rows[0]!.organizationId, org)
        assert(rows[0]!.createdAt.getTime() <= Date.now())
      })
      await t.test(
        'invalid durations, unknown fields, too many events and missing sessions reject',
        async () => {
          for (const durationMs of [120001, -1, 0.5, '3000'])
            await call('POST', '/api/me/feed-events', 400, student.accessToken, {
              events: [{ ...event, eventId: randomUUID(), durationMs }],
            })
          await call('POST', '/api/me/feed-events', 400, student.accessToken, {
            events: Array.from({ length: 26 }, () => ({ ...event, eventId: randomUUID() })),
          })
          await call('POST', '/api/me/feed-events', 400, student.accessToken, {
            events: [{ ...event, arbitraryUserId: captain.user.id }],
          })
          await call('POST', '/api/me/feed-events', 401, undefined, { events: [event] })
        },
      )
      await t.test(
        'old batches immediately exclude withdrawn posts without shifting pagination',
        async () => {
          const id = first.items[0].id
          await db.post.update({ where: { id }, data: { status: 'HIDDEN' } })
          const after = await feed(student, '&batchId=' + first.batchId)
          assert(!after.items.some((p: any) => p.id === id))
          assert.equal(after.nextCursor, first.nextCursor)
          assert.equal(
            (
              await call('POST', '/api/me/feed-events', 200, student.accessToken, {
                events: [{ ...event, eventId: randomUUID() }],
              })
            ).data.accepted,
            0,
          )
        },
      )
      await t.test(
        'new batches vary and explicit expiry allows the client to recover',
        async () => {
          const next = await feed(student, '&refresh=' + randomUUID())
          assert.notEqual(next.batchId, first.batchId)
          const batches = (app.get(FeedService) as any).batches as Map<string, { until: number }>
          batches.get(next.batchId)!.until = 0
          await call('GET', '/api/public/feed?batchId=' + next.batchId, 410, student.accessToken)
          assert.equal(
            (
              await call('POST', '/api/me/feed-events', 200, student.accessToken, {
                events: [
                  {
                    ...event,
                    eventId: randomUUID(),
                    batchId: next.batchId,
                    postId: next.items[0].id,
                  },
                ],
              })
            ).data.accepted,
            0,
          )
        },
      )
      await t.test(
        'manual posts get server provenance and revoked tokens fail both endpoints',
        async () => {
          const created = (
            await call('POST', '/api/community/posts', 201, student.accessToken, {
              clientPostId: 'feed-acceptance-' + randomUUID(),
              body: 'FICTIONAL_TEST 真人手动发布的校园足球训练记录',
            })
          ).data
          createdPostIds.push(created.id)
          assert.equal(
            (await db.post.findUniqueOrThrow({ where: { id: created.id } })).publicationSource,
            'USER',
          )
          await db.userSession.updateMany({
            where: { userId: student.user.id },
            data: { revokedAt: new Date() },
          })
          await call(
            'GET',
            '/api/public/feed?tournamentId=' + tournament.id,
            401,
            student.accessToken,
          )
          await call('POST', '/api/me/feed-events', 401, student.accessToken, { events: [event] })
        },
      )
      console.log(
        'RECOMMENDATION_HTTP_METRICS ' +
          JSON.stringify({ ...times, fixturePosts: ids.length, model: first.modelState }),
      )
    } finally {
      await app.close()
      await db.post.deleteMany({ where: { id: { in: createdPostIds } } })
      await db.$disconnect()
    }
  },
)
