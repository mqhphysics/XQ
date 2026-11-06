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
import sharp from 'sharp'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test(
  'check-in real HTTP: persistence, concurrent retries, account isolation and restored UGC',
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
    await prisma.competitionRuleVersion.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        version: 1,
        name: 'FICTIONAL_TEST 已发布赛事规程',
        status: 'PUBLISHED',
        rules: {
          results: {
            points: { win: 3, draw: 1, loss: 0 },
            tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
            headToHead: { criteria: ['POINTS'], reapplyToRemainingTeams: false },
            groupShootout: 'REJECT',
            knockoutShootout: 'ALLOWED',
            forfeit: { winnerGoals: 3, loserGoals: 0, loserPoints: -1, both: null },
          },
        },
      },
    })
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
    const avatarFolder = await mkdtemp(join(tmpdir(), 'xq-avatar-acceptance-'))
    const previousAvatarFolder = process.env.AVATAR_MEDIA_DIRECTORY
    process.env.AVATAR_MEDIA_DIRECTORY = avatarFolder
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
      const postKey = randomUUID()
      const create = () =>
        request(server).post('/api/community/posts').set('Authorization', auth[0]!).send({
          body: 'FICTIONAL_TEST restored post',
          clientPostId: postKey,
          tournamentId: tournament.id,
        })
      const post = await create().expect(201)
      assert.equal((await create().expect(201)).body.id, post.body.id)
      await request(server)
        .post('/api/community/posts')
        .send({ body: 'anonymous', clientPostId: randomUUID() })
        .expect(401)
      await request(server)
        .post('/api/community/posts')
        .set('Authorization', auth[0]!)
        .send({
          body: 'FICTIONAL_TEST quote',
          clientPostId: randomUUID(),
          tournamentId: tournament.id,
          quotedPostId: post.body.id,
        })
        .expect(201)
      const comment = await request(server)
        .post('/api/community/posts/' + post.body.id + '/comments')
        .set('Authorization', auth[1]!)
        .send({ body: 'FICTIONAL_TEST comment', clientCommentId: randomUUID() })
        .expect(201)
      await request(server)
        .post('/api/community/posts/' + post.body.id + '/comments')
        .set('Authorization', auth[0]!)
        .send({
          body: 'FICTIONAL_TEST reply',
          clientCommentId: randomUUID(),
          parentCommentId: comment.body.id,
        })
        .expect(201)
      await request(server)
        .post('/api/community/posts/' + post.body.id + '/comments')
        .set('Authorization', auth[2]!)
        .send({ body: 'foreign comment', clientCommentId: randomUUID() })
        .expect(404)
      const messageId = randomUUID()
      const send = () =>
        request(server)
          .post('/api/messages/direct/' + users[1]!.id)
          .set('Authorization', auth[0]!)
          .send({ body: 'FICTIONAL_TEST private', clientMessageId: messageId })
      const direct = await send().expect(201)
      assert.equal((await send().expect(201)).body.message.id, direct.body.message.id)
      await request(server)
        .get('/api/messages/conversations/' + direct.body.conversationId)
        .set('Authorization', auth[2]!)
        .expect(404)
      await request(server)
        .post('/api/messages/direct/' + users[2]!.id)
        .set('Authorization', auth[0]!)
        .send({ body: 'foreign private', clientMessageId: randomUUID() })
        .expect(404)
      await request(server)
        .post('/api/matches/' + match.id + '/reviews')
        .set('Authorization', auth[0]!)
        .send({ body: 'FICTIONAL_TEST match comment' })
        .expect(200)
      assert.equal(
        (await read().expect(200)).body.count,
        2,
        'comments and messages never create check-ins',
      )
      const ratingResponse = await request(server)
        .post(`/api/matches/${match.id}/reviews`)
        .set('Authorization', auth[0]!)
        .send({ rating: 4 })
      assert.equal(ratingResponse.status, 200, JSON.stringify(ratingResponse.body))
      const player = await prisma.playerProfile.create({
        data: { organizationId: org.id, displayName: 'FICTIONAL_TEST 头像球员' },
      })
      await prisma.user.update({
        where: { id: users[0]!.id },
        data: { playerProfileId: player.id },
      })
      const jpeg = await sharp({
        create: { width: 512, height: 512, channels: 3, background: '#386b4b' },
      })
        .jpeg({ quality: 90 })
        .toBuffer()
      const avatarResponse = await request(server)
        .put('/api/me/avatar')
        .set('Authorization', auth[0]!)
        .send({ dataUrl: 'data:image/jpeg;base64,' + jpeg.toString('base64') })
      assert.equal(avatarResponse.status, 200, JSON.stringify(avatarResponse.body))
      const linked = await prisma.playerProfile.findUniqueOrThrow({ where: { id: player.id } })
      assert.equal(
        linked.avatarUrl,
        avatarResponse.body.user.avatarUrl,
        'Uploaded avatar must reach the linked player',
      )
      const image = await request(server).get(linked.avatarUrl!).expect(200)
      assert.equal(image.headers['content-type'], 'image/webp')
      await prisma.roleAssignment.create({
        data: {
          organizationId: org.id,
          userId: users[0]!.id,
          role: 'MATCH_REPORTER',
          scopeType: 'TOURNAMENT',
          scopeId: tournament.id,
        },
      })
      const quality = await request(server)
        .get('/api/me/reporter-quality')
        .set('Authorization', auth[0]!)
      assert.equal(quality.status, 200, JSON.stringify(quality.body))
      assert.equal(quality.body.profile.score, 100)
      assert.equal(quality.body.recordedMatchCount, 0)
      const homeTeam = await prisma.team.create({
        data: { organizationId: org.id, teamCode: 'home-' + suffix, name: 'FICTIONAL_TEST 主队' },
      })
      const away = await prisma.team.create({
        data: {
          organizationId: org.id,
          teamCode: 'away-' + suffix,
          name: 'FICTIONAL_TEST 关注球队',
        },
      })
      const prefs = (data: object) =>
        request(server).put('/api/me/team-preferences').set('Authorization', auth[0]!).send(data)
      await prefs({ primaryTeamId: homeTeam.id, followedTeamIds: [away.id] }).expect(200)
      const cleared = await prefs({ primaryTeamId: null, followedTeamIds: [away.id] }).expect(200)
      assert.equal(cleared.body.primaryTeam, null)
      assert.deepEqual(
        cleared.body.followedTeams.map((t: { id: string }) => t.id),
        [away.id],
      )
      const reread = await request(server)
        .get('/api/me/team-preferences')
        .set('Authorization', auth[0]!)
        .expect(200)
      assert.equal(reread.body.primaryTeam, null)
      await prefs({ followedTeamIds: [] }).expect(400)
      await prefs({ primaryTeamId: homeTeam.id, followedTeamIds: [] }).expect(200)
      await prisma.match.update({
        where: { id: match.id },
        data: { homeTeamId: homeTeam.id, awayTeamId: away.id, homeScore: 1, awayScore: 0 },
      })
      const overview = async () => {
        const response = await request(server)
          .get('/api/match-reports/overview?tournamentId=' + tournament.id)
          .set('Authorization', auth[0]!)
          .expect(200)
        assert.equal(response.body.completionRuleVersion, 1)
        return response.body.items.find((m: { matchId: string }) => m.matchId === match.id)
      }
      assert.equal((await overview()).recorded, false, 'A score without goal facts remains pending')
      const goal = await prisma.matchEvent.create({
        data: {
          organizationId: org.id,
          matchId: match.id,
          teamId: homeTeam.id,
          type: 'GOAL',
          minute: 12,
        },
      })
      assert.equal((await overview()).recorded, false, 'An anonymous scorer remains pending')
      await prisma.matchEvent.update({ where: { id: goal.id }, data: { playerId: player.id } })
      assert.equal(
        (await overview()).recorded,
        true,
        'A scorer and time matching the score completes recording; assist is optional',
      )
      await prisma.matchEvent.update({ where: { id: goal.id }, data: { type: 'OWN_GOAL' } })
      assert.equal((await overview()).recorded, false, 'Own goals credit the other side')
      await prisma.matchEvent.update({ where: { id: goal.id }, data: { teamId: away.id } })
      assert.equal((await overview()).recorded, true)
      const dashboard = await request(server)
        .get(`/api/public/teams/${homeTeam.id}/dashboard?tournamentId=${tournament.id}`)
        .set('x-organization-id', org.id)
        .expect(200)
      assert.ok(
        dashboard.body.recentMatches.some((item: { id: string }) => item.id === match.id),
        'Preserve the live visibility fix for finished matches without a report revision',
      )
      await prisma.post.createMany({
        data: Array.from({ length: 21 }, (_, index) => ({
          organizationId: org.id,
          tournamentId: tournament.id,
          type: 'COMMUNITY' as const,
          status: 'PUBLISHED' as const,
          body: `FICTIONAL_TEST 历史动态 ${index}`,
          publishedAt: new Date(),
        })),
      })
      const announcement = await prisma.post.create({
        data: {
          organizationId: org.id,
          tournamentId: tournament.id,
          type: 'OFFICIAL',
          status: 'PUBLISHED',
          title: 'FICTIONAL_TEST 重要公告',
          body: 'FICTIONAL_TEST 旧公告不会被近期动态挤掉',
          publishedAt: new Date('2025-01-01T00:00:00Z'),
        },
      })
      const home = await request(server)
        .get('/api/public/home?tournamentId=' + tournament.id)
        .set('x-organization-id', org.id)
        .expect(200)
      assert.ok(home.body.announcements.some((item: { id: string }) => item.id === announcement.id))
      const dataPath = '/api/public/tournaments/' + tournament.id + '/competition-data'
      const firstData = await request(server)
        .get(dataPath)
        .set('x-organization-id', org.id)
        .expect(200)
      assert.ok(firstData.headers.etag)
      await request(server)
        .get(dataPath)
        .set('x-organization-id', org.id)
        .set('If-None-Match', firstData.headers.etag)
        .expect(304)
      const reopened = new PrismaClient({ datasources: { db: { url } } })
      try {
        assert.equal(await reopened.matchCheckin.count({ where: { matchId: match.id } }), 2)
      } finally {
        await reopened.$disconnect()
      }
    } finally {
      try {
        await app.close()
        await prisma.$disconnect()
      } finally {
        if (previousAvatarFolder === undefined) delete process.env.AVATAR_MEDIA_DIRECTORY
        else process.env.AVATAR_MEDIA_DIRECTORY = previousAvatarFolder
        await rm(avatarFolder, { recursive: true, force: true })
      }
    }
  },
)
