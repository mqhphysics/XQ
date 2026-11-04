import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaClient } from '../generated/prisma/client'
import { seedDemoFixture } from '../database/seed-demo-fixture'

const configuredUrl = process.env.TEST_DATABASE_URL

test(
  'tagged post HTTP persistence, related feeds, idempotency, audit and tenant constraints',
  { skip: !configuredUrl, timeout: 60_000 },
  async (t) => {
    assert.ok(configuredUrl)
    const url = new URL(configuredUrl)
    assert.match(
      decodeURIComponent(url.pathname.slice(1)),
      /(?:^|_)(?:test|ci)(?:_|$)/,
      'Use an isolated test/CI database',
    )
    const previousDatabase = process.env.DATABASE_URL
    const previousTournament = process.env.DEFAULT_TOURNAMENT_ID
    const schema = `post_tags_test_${randomUUID().slice(0, 8)}`
    assert.match(schema, /^post_tags_test_[a-f0-9]{8}$/)
    const admin = new PrismaClient({ datasources: { db: { url: configuredUrl } } })
    let schemaCreated = false
    let schemaClient: PrismaClient | undefined
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
      schemaCreated = true
      url.searchParams.set('schema', schema)
      process.env.DATABASE_URL = url.toString()
      const migration = spawnSync(
        process.execPath,
        [
          resolve(__dirname, '../../../node_modules/prisma/build/index.js'),
          'migrate',
          'deploy',
          '--schema',
          resolve(__dirname, '../../../../../prisma/schema.prisma'),
        ],
        { env: process.env, encoding: 'utf8', timeout: 20_000 },
      )
      assert.equal(
        migration.status,
        0,
        `Isolated test-schema migration failed: ${migration.stdout} ${migration.stderr}`,
      )
      const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } })
      schemaClient = prisma
      await seedDemoFixture(prisma)
      const org = '00000000-0000-4000-8000-000000000001'
      const tournament = await prisma.tournament.findFirstOrThrow({
        where: { organizationId: org, tournamentCode: 'DEMO-GREEN-CUP-2026', status: 'PUBLISHED' },
      })
      process.env.DEFAULT_TOURNAMENT_ID = tournament.id
      const team = await prisma.team.findFirstOrThrow({
        where: { organizationId: org, teamCode: 'DEMO-MATH' },
      })
      const player = await prisma.playerProfile.findFirstOrThrow({
        orderBy: { displayName: 'desc' },
        where: {
          organizationId: org,
          snapshotEntries: {
            some: {
              organizationId: org,
              rosterSnapshot: {
                tournamentId: tournament.id,
                teamId: team.id,
                lockedAt: { not: null },
              },
            },
          },
        },
      })
      const suffix = randomUUID().slice(0, 8)
      const otherOrg = await prisma.organization.create({
        data: { slug: `fictional-tags-${suffix}`, name: 'FICTIONAL_TEST 标签隔离组织' },
      })
      const otherTeam = await prisma.team.create({
        data: {
          organizationId: otherOrg.id,
          teamCode: `FICTIONAL-TAGS-${suffix}`,
          name: 'FICTIONAL_TEST 跨组织球队',
        },
      })
      const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
      const app = module.createNestApplication()
      configureApp(app)
      await app.init()
      const posts: string[] = []
      const topic = `FICTIONAL_TEST_${suffix}`
      try {
        const login = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ username: 'student', password: 'Xiaoqiu2026!' })
          .expect(200)
        const token = login.body.accessToken as string
        const userId = login.body.user.id as string
        const publish = (payload: object) =>
          request(app.getHttpServer())
            .post('/api/community/posts')
            .set('Authorization', `Bearer ${token}`)
            .send(payload)
        const publicGet = (path: string, organizationId = org) =>
          request(app.getHttpServer())
            .get(`/api${path}`)
            .set('Authorization', `Bearer ${token}`)
            .set('x-dev-organization-id', organizationId)
        const payload = {
          clientPostId: `tags-${suffix}-roundtrip`,
          tournamentId: tournament.id,
          body: 'FICTIONAL_TEST 普通球迷记录比赛',
          tags: [
            { kind: 'TEAM', targetId: team.id, label: '客户端伪造队名' },
            { kind: 'PLAYER', targetId: player.id, label: '客户端伪造球员名' },
            { kind: 'TOPIC', label: topic },
            { kind: 'TOPIC', label: topic.toLowerCase() },
          ],
        }
        const first = await publish(payload).expect(201)
        posts.push(first.body.id)
        assert.equal(
          first.body.team,
          null,
          'tagging a team must not impersonate an official team author',
        )
        assert.equal(first.body.tags.length, 3)
        assert.equal(first.body.tags[0].label, team.name)
        assert.equal(first.body.tags[1].label, player.displayName)
        assert.equal(first.body.tournamentId, tournament.id)
        await t.test(
          'one community post persists three canonical tags and appears in both related feeds',
          async () => {
            const detail = await publicGet(`/public/posts/${first.body.id}`).expect(200)
            assert.deepEqual(detail.body.tags, first.body.tags)
            const teamFeed = await publicGet(
              `/public/teams/${team.id}/dashboard?tournamentId=${tournament.id}`,
            ).expect(200)
            const playerFeed = await publicGet(
              `/public/players/${player.id}?tournamentId=${tournament.id}`,
            ).expect(200)
            assert.ok(teamFeed.body.posts.some((post: { id: string }) => post.id === first.body.id))
            assert.ok(
              playerFeed.body.posts.some((post: { id: string }) => post.id === first.body.id),
            )
            assert.equal(
              await prisma.postTag.count({ where: { organizationId: org, postId: first.body.id } }),
              3,
            )
            const audit = await prisma.auditLog.findMany({
              where: {
                organizationId: org,
                targetId: first.body.id,
                action: 'COMMUNITY_POST_CREATED',
              },
            })
            assert.equal(audit.length, 1)
            assert.equal((audit[0]?.afterSummary as { tags: unknown[] }).tags.length, 3)
          },
        )
        await t.test(
          'same submission is idempotent and changed tags conflict without rewriting it',
          async () => {
            const retry = await publish(payload).expect(201)
            assert.equal(retry.body.id, first.body.id)
            await publish({ ...payload, tags: [{ kind: 'TOPIC', label: '不同的话题' }] }).expect(
              409,
            )
            assert.equal(
              await prisma.postTag.count({ where: { postId: first.body.id, organizationId: org } }),
              3,
            )
            assert.equal(
              await prisma.auditLog.count({
                where: {
                  targetId: first.body.id,
                  action: 'COMMUNITY_POST_CREATED',
                  organizationId: org,
                },
              }),
              1,
            )
          },
        )
        await t.test('public tags never grant official team publishing permissions', async () => {
          await publish({
            ...payload,
            clientPostId: `tags-${suffix}-official`,
            teamId: team.id,
          }).expect(403)
        })
        await t.test(
          'foreign, nonpublic and invalid tag targets are rejected before any post is committed',
          async () => {
            await publish({
              ...payload,
              clientPostId: `tags-${suffix}-foreign`,
              tags: [{ kind: 'TEAM', targetId: otherTeam.id }],
            }).expect(400)
            await publish({
              ...payload,
              clientPostId: `tags-${suffix}-unknown`,
              tags: [{ kind: 'PLAYER', targetId: randomUUID() }],
            }).expect(400)
            await publish({
              ...payload,
              clientPostId: `tags-${suffix}-limit`,
              tags: Array.from({ length: 11 }, (_, i) => ({ kind: 'TOPIC', label: `话题${i}` })),
            }).expect(400)
            await publish({
              ...payload,
              clientPostId: `tags-${suffix}-long`,
              tags: [{ kind: 'TOPIC', label: '长'.repeat(31) }],
            }).expect(400)
            await publicGet(`/public/posts/${first.body.id}`, otherOrg.id).expect(403)
            assert.equal(
              await prisma.post.count({
                where: {
                  organizationId: org,
                  clientPostId: {
                    in: [
                      `tags-${suffix}-foreign`,
                      `tags-${suffix}-unknown`,
                      `tags-${suffix}-limit`,
                      `tags-${suffix}-long`,
                    ],
                  },
                },
              }),
              0,
            )
          },
        )
        await t.test('database rejects cross-organization and contradictory tag rows', async () => {
          await assert.rejects(
            prisma.postTag.create({
              data: {
                organizationId: otherOrg.id,
                postId: first.body.id,
                kind: 'TEAM',
                key: `TEAM:${otherTeam.id}`,
                label: otherTeam.name,
                teamId: otherTeam.id,
                position: 0,
              },
            }),
          )
          await assert.rejects(
            prisma.postTag.create({
              data: {
                organizationId: org,
                postId: first.body.id,
                kind: 'TOPIC',
                key: 'TOPIC:invalid-target',
                label: 'invalid-target',
                teamId: team.id,
                position: 3,
              },
            }),
          )
        })
        await t.test(
          'common suggestions are public and hidden posts disappear from all related feeds',
          async () => {
            const suggestions = await publicGet(
              `/public/post-tags?query=${encodeURIComponent(team.name)}&tournamentId=${tournament.id}`,
            ).expect(200)
            assert.ok(
              suggestions.body.items.some(
                (tag: { kind: string; targetId: string }) =>
                  tag.kind === 'TEAM' && tag.targetId === team.id,
              ),
            )
            const common = await publicGet(
              `/public/post-tags?query=${topic}&tournamentId=${tournament.id}`,
            ).expect(200)
            assert.ok(common.body.items.some((tag: { label: string }) => tag.label === topic))
            await prisma.post.update({ where: { id: first.body.id }, data: { status: 'HIDDEN' } })
            await publicGet(`/public/posts/${first.body.id}`).expect(404)
            const teamFeed = await publicGet(
              `/public/teams/${team.id}/dashboard?tournamentId=${tournament.id}`,
            ).expect(200)
            const playerFeed = await publicGet(
              `/public/players/${player.id}?tournamentId=${tournament.id}`,
            ).expect(200)
            assert.ok(
              !teamFeed.body.posts.some((post: { id: string }) => post.id === first.body.id),
            )
            assert.ok(
              !playerFeed.body.posts.some((post: { id: string }) => post.id === first.body.id),
            )
            const hiddenSuggestions = await publicGet(
              `/public/post-tags?query=${topic}&tournamentId=${tournament.id}`,
            ).expect(200)
            assert.ok(
              !hiddenSuggestions.body.items.some((tag: { label: string }) => tag.label === topic),
            )
          },
        )
        await t.test(
          'suggestions rank all tag kinds by published usage within the current tenant and season',
          async () => {
            const popular = `F_TEST_popular_${suffix}`
            const recent = `F_TEST_recent_${suffix}`
            for (let index = 0; index < 4; index += 1) {
              const ranked = await publish({
                clientPostId: `tags-${suffix}-frequency-${index}`,
                tournamentId: tournament.id,
                body: 'FICTIONAL_TEST 标签频率验证',
                tags: [
                  { kind: 'TEAM', targetId: team.id },
                  ...(index < 3 ? [{ kind: 'PLAYER', targetId: player.id }] : []),
                  ...(index < 2 ? [{ kind: 'TOPIC', label: popular }] : []),
                  ...(index === 3 ? [{ kind: 'TOPIC', label: recent }] : []),
                ],
              }).expect(201)
              posts.push(ranked.body.id)
            }
            const previousSeason = await prisma.tournament.findFirstOrThrow({
              where: { organizationId: org, id: { not: tournament.id } },
            })
            for (const scope of [
              { organizationId: org, tournamentId: tournament.id, status: 'HIDDEN' as const },
              {
                organizationId: org,
                tournamentId: previousSeason.id,
                status: 'PUBLISHED' as const,
              },
              { organizationId: otherOrg.id, tournamentId: null, status: 'PUBLISHED' as const },
            ]) {
              for (let index = 0; index < 3; index += 1) {
                const excluded = await prisma.post.create({
                  data: {
                    ...scope,
                    body: 'FICTIONAL_TEST 不应计入本赛事频率的资料',
                  },
                })
                posts.push(excluded.id)
                await prisma.postTag.create({
                  data: {
                    organizationId: scope.organizationId,
                    postId: excluded.id,
                    kind: 'TOPIC',
                    key: `TOPIC:${recent.toLocaleLowerCase('zh-CN')}`,
                    label: recent,
                    position: 0,
                  },
                })
              }
            }
            const ranked = await publicGet(
              `/public/post-tags?tournamentId=${tournament.id}`,
            ).expect(200)
            assert.deepEqual(
              ranked.body.items
                .slice(0, 4)
                .map((tag: { kind: string; targetId?: string; label: string }) =>
                  tag.kind === 'TOPIC' ? tag.label : tag.targetId,
                ),
              [team.id, player.id, popular, recent],
              'Counts 4/3/2/1 outrank recency and ignore hidden, other-season and foreign posts',
            )
            const exact = await publicGet(
              `/public/post-tags?query=${encodeURIComponent(player.displayName)}&tournamentId=${tournament.id}`,
            ).expect(200)
            assert.equal(exact.body.items[0].targetId, player.id)
          },
        )
        await t.test('old publications without tags remain supported', async () => {
          const old = await publish({
            clientPostId: `tags-${suffix}-old`,
            body: 'FICTIONAL_TEST 旧格式发布',
            tournamentId: tournament.id,
          }).expect(201)
          posts.push(old.body.id)
          assert.deepEqual(old.body.tags, [])
        })
        await request(app.getHttpServer())
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${token}`)
          .expect(204)
        assert.ok(userId)
      } finally {
        await app.close()
        await prisma.auditLog.deleteMany({
          where: { organizationId: org, targetId: { in: posts } },
        })
        await prisma.post.deleteMany({
          where: { organizationId: { in: [org, otherOrg.id] }, id: { in: posts } },
        })
        await prisma.team.delete({ where: { id: otherTeam.id } })
        await prisma.organization.delete({ where: { id: otherOrg.id } })
        await prisma.$disconnect()
      }
    } finally {
      await schemaClient?.$disconnect()
      if (schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)
      await admin.$disconnect()
      if (previousDatabase === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previousDatabase
      if (previousTournament === undefined) delete process.env.DEFAULT_TOURNAMENT_ID
      else process.env.DEFAULT_TOURNAMENT_ID = previousTournament
    }
  },
)
