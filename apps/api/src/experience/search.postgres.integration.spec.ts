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
  'FICTIONAL_TEST: public typo-tolerant search recalls public objects and preserves organization/publication scope',
  { timeout: 120000 },
  async (t) => {
    const database = process.env.TEST_DATABASE_URL
    if (!database) {
      t.skip('Requires dedicated TEST_DATABASE_URL')
      return
    }
    assert.match(new URL(database).pathname, /search_test/)
    process.env.DATABASE_URL = database
    const db = new PrismaClient({ datasources: { db: { url: database } } })
    await seedDemoFixture(db)
    const org = '00000000-0000-4000-8000-000000000001',
      tournament = await db.tournament.findFirstOrThrow({
        where: { organizationId: org, tournamentCode: 'DEMO-GREEN-CUP-2026' },
      })
    const member = await db.teamMembership.findFirstOrThrow({
      where: { organizationId: org, status: 'ACTIVE', playerProfileId: { not: null } },
      include: { team: true, playerProfile: true },
    })
    await db.team.update({
      where: { id: member.teamId },
      data: { name: '测试甲队', shortName: '测甲', collegeName: '测试学院' },
    })
    await db.playerProfile.update({
      where: { id: member.playerProfileId! },
      data: {
        displayName: '测试甲乙',
        jerseyName: 'Physics',
        avatarUrl: null,
        portraitUrl: 'https://images.example.invalid/fictional-player.jpg',
      },
    })
    const post = await db.post.create({
      data: {
        organizationId: org,
        tournamentId: tournament.id,
        type: 'COMMUNITY',
        status: 'PUBLISHED',
        title: '夜场约球公告',
        body: '周五晚来球场踢球，欢迎参与',
        publishedAt: new Date(),
      },
    })
    await db.postTag.create({
      data: {
        organizationId: org,
        postId: post.id,
        kind: 'TOPIC',
        key: 'TOPIC:物院训练',
        label: '物院训练',
        position: 0,
      },
    })
    const hidden = await db.post.create({
      data: {
        organizationId: org,
        tournamentId: tournament.id,
        type: 'COMMUNITY',
        status: 'DRAFT',
        title: '夜场约球私人草稿',
        body: '不应出现在公开搜索',
      },
    })
    const other = await db.organization.create({
      data: {
        id: randomUUID(),
        slug: 'fictional-search-' + randomUUID(),
        name: 'FICTIONAL OTHER ORGANIZATION',
      },
    })
    const foreign = await db.team.create({
      data: {
        organizationId: other.id,
        teamCode: 'FOREIGN-SEARCH',
        name: '测试甲队',
        shortName: '测甲',
      },
    })
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    configureApp(app)
    await app.listen(0, '127.0.0.1')
    const base = await app.getUrl()
    const search = async (query: string, category = 'ALL') => {
      const params = new URLSearchParams({ query, category, tournamentId: tournament.id }),
        response = await fetch(base + '/api/public/search?' + params, {
          headers: { 'x-organization-id': org },
        }),
        data = await response.json()
      assert.equal(response.status, 200, JSON.stringify(data))
      return data
    }
    try {
      await t.test(
        'portrait-only players keep their uploaded photo in search summaries',
        async () => {
          const data = await search('测试甲乙', 'PLAYER')
          assert.equal(
            data.players[0].avatarUrl,
            'https://images.example.invalid/fictional-player.jpg',
          )
        },
      )
      await t.test(
        'one wrong character retains the intended team and complete names rank ahead of weak overlaps',
        async () => {
          const exact = await search('测试甲队', 'TEAM'),
            typo = await search('测试甲对', 'TEAM')
          assert.equal(exact.teams[0].id, member.teamId)
          assert.equal(typo.teams[0].id, member.teamId)
          assert.ok(!typo.teams.some((row: { id: string }) => row.id === foreign.id))
        },
      )
      await t.test(
        'multiple words may match different public fields and a wrong word does not empty the result',
        async () => {
          const data = await search('测甲 测试甲已', 'PLAYER')
          assert.equal(data.players[0].id, member.playerProfileId)
          const partial = await search('测试甲队 完全错词', 'TEAM')
          assert.ok(partial.teams.some((row: { id: string }) => row.id === member.teamId))
          const latin = await search('physcis', 'PLAYER')
          assert.equal(latin.players[0].id, member.playerProfileId)
        },
      )
      await t.test(
        'post bodies and tags are searchable, but drafts and wildcard-only input stay out',
        async () => {
          const data = await search('约球 时间写错', 'POST')
          assert.ok(data.posts.some((row: { id: string }) => row.id === post.id))
          assert.ok(!data.posts.some((row: { id: string }) => row.id === hidden.id))
          const tagged = await search('物院训练', 'POST')
          assert.ok(tagged.posts.some((row: { id: string }) => row.id === post.id))
          const empty = await search('%%%_')
          assert.equal(
            empty.players.length + empty.teams.length + empty.matches.length + empty.posts.length,
            0,
          )
        },
      )
    } finally {
      await app.close()
      await db.$disconnect()
    }
  },
)
