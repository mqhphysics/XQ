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
  'focus real HTTP: account personalization, official scores, cooldown, organization and draft boundaries',
  { timeout: 60000 },
  async () => {
    const url = process.env.TEST_DATABASE_URL
    assert.ok(url)
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
      data: { slug: `focus-${suffix}`, name: 'FICTIONAL_TEST 焦点赛事' },
    })
    const foreign = await prisma.organization.create({
      data: { slug: `focus-other-${suffix}`, name: 'FICTIONAL_TEST 另一组织' },
    })
    const season = await prisma.season.create({
      data: { organizationId: org.id, seasonCode: suffix, name: 'FICTIONAL_TEST 赛季' },
    })
    const tournaments: Array<{ id: string }> = [],
      matches: Array<{ id: string }> = [],
      teams: Array<{ id: string }> = []
    for (const gender of ['MEN', 'WOMEN']) {
      const competition = await prisma.competitionDefinition.create({
        data: {
          organizationId: org.id,
          code: suffix + gender,
          cupName: suffix,
          gender,
          name: gender,
        },
      })
      const tournament = await prisma.tournament.create({
        data: {
          organizationId: org.id,
          seasonId: season.id,
          competitionDefinitionId: competition.id,
          tournamentCode: suffix + gender,
          name: gender,
          status: 'PUBLISHED',
        },
      })
      tournaments.push(tournament)
      await prisma.competitionRuleVersion.create({
        data: {
          organizationId: org.id,
          tournamentId: tournament.id,
          version: 1,
          name: 'FICTIONAL_TEST 规程',
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
      const team = await prisma.team.create({
        data: {
          organizationId: org.id,
          teamCode: suffix + gender,
          name: gender,
          collegeName: gender + '学院',
        },
      })
      teams.push(team)
      matches.push(
        await prisma.match.create({
          data: {
            organizationId: org.id,
            tournamentId: tournament.id,
            matchCode: suffix + gender,
            title: gender,
            homeTeamId: team.id,
            status: 'SCHEDULED',
            scheduledStartAt: new Date(Date.now() + 3600000),
          },
        }),
      )
    }
    const finished = await prisma.match.create({
      data: {
        organizationId: org.id,
        tournamentId: tournaments[0]!.id,
        matchCode: suffix + 'ended',
        title: 'FICTIONAL_TEST 未确认比分',
        status: 'FINISHED',
        scheduledStartAt: new Date(Date.now() - 3600000),
        homeScore: 9,
        awayScore: 8,
      },
    })
    const draft = await prisma.match.create({
      data: {
        organizationId: org.id,
        tournamentId: tournaments[0]!.id,
        matchCode: suffix + 'draft',
        title: 'FICTIONAL_TEST 草稿',
        status: 'DRAFT',
      },
    })
    const password = `Test-${suffix}!`,
      credential = await hashPassword(password)
    const users = await Promise.all(
      [org, org, foreign].map((organization, i) =>
        prisma.user.create({
          data: {
            displayName: `FICTIONAL_TEST ${i}`,
            loginNameNormalized: `focus-${suffix}-${i}`,
            memberships: { create: { organizationId: organization.id, status: 'ACTIVE' } },
            passwordCredential: {
              create: { passwordHash: credential.hash, passwordSalt: credential.salt },
            },
            ...(i === 0
              ? {
                  studentVerifiedAt: new Date(),
                  studentRecord: {
                    create: { organizationId: org.id, realName: 'FICTIONAL_TEST', gender: 'MALE' },
                  },
                }
              : {}),
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
          const response = await request(server)
            .post('/api/auth/login')
            .set('x-organization-id', index === 2 ? foreign.id : org.id)
            .send({ username: user.loginNameNormalized, password })
            .expect(200)
          return `Bearer ${response.body.accessToken}`
        }),
      )
      const list = (token?: string) => {
        const response = request(server)
          .get('/api/public/focus-matches?tournamentId=' + tournaments[0]!.id)
          .set('x-organization-id', org.id)
        return token ? response.set('Authorization', token) : response
      }
      const endpoint = '/api/matches/' + matches[1]!.id + '/interest'
      const before = await list(auth[0]).expect(200)
      assert.equal(before.body.items[0].id, matches[0]!.id)
      assert.match(String(before.headers['cache-control']), /private.*no-store/)
      assert.equal(
        before.body.items.find((m: { id: string }) => m.id === finished.id).homeScore,
        null,
      )
      assert.ok(!before.body.items.some((m: { id: string }) => m.id === draft.id))
      await request(server).put(endpoint).expect(401)
      await request(server)
        .put('/api/matches/invalid/interest')
        .set('Authorization', auth[0]!)
        .expect(400)
      await request(server)
        .put('/api/matches/' + draft.id + '/interest')
        .set('Authorization', auth[0]!)
        .expect(404)
      await request(server).put(endpoint).set('Authorization', auth[2]!).expect(404)
      await list(auth[2]).expect(403)
      const repeated = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(server).put(endpoint).set('Authorization', auth[0]!).expect(200),
        ),
      )
      assert.equal(repeated.filter((r) => r.body.accepted).length, 1)
      assert.equal(
        (
          await prisma.userMatchInterest.findUniqueOrThrow({
            where: { userId_matchId: { userId: users[0]!.id, matchId: matches[1]!.id } },
          })
        ).viewCount,
        1,
      )
      for (let i = 0; i < 2; i++) {
        await prisma.userMatchInterest.update({
          where: { userId_matchId: { userId: users[0]!.id, matchId: matches[1]!.id } },
          data: { lastViewedAt: new Date(Date.now() - 16 * 60000) },
        })
        assert.equal(
          (await request(server).put(endpoint).set('Authorization', auth[0]!).expect(200)).body
            .accepted,
          true,
        )
      }
      assert.equal((await list(auth[0]).expect(200)).body.items[0].id, matches[1]!.id)
      assert.equal((await list(auth[1]).expect(200)).body.items[0].id, matches[0]!.id)
      assert.equal(await prisma.userMatchInterest.count({ where: { userId: users[1]!.id } }), 0)
      await prisma.userTeamPreference.create({
        data: {
          organizationId: org.id,
          userId: users[0]!.id,
          teamId: teams[0]!.id,
          isPrimary: true,
        },
      })
      assert.equal((await list(auth[0]).expect(200)).body.items[0].id, matches[0]!.id)
      await prisma.tournament.update({
        where: { id: tournaments[1]!.id },
        data: { status: 'DRAFT' },
      })
      await request(server).put(endpoint).set('Authorization', auth[0]!).expect(404)
      assert.ok(
        !(await list(auth[0]).expect(200)).body.items.some(
          (m: { id: string }) => m.id === matches[1]!.id,
        ),
      )
      await list().expect(200)
      const reopened = new PrismaClient({ datasources: { db: { url } } })
      try {
        assert.equal(
          (await reopened.userMatchInterest.findFirstOrThrow({ where: { userId: users[0]!.id } }))
            .viewCount,
          3,
        )
      } finally {
        await reopened.$disconnect()
      }
    } finally {
      await app.close()
      await prisma.$disconnect()
    }
  },
)
