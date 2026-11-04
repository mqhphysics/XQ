import 'reflect-metadata'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import sharp from 'sharp'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'
import { MediaStorage } from './media-storage'
import { dataUrl, gifFixture } from './media-test-fixtures'
import { AuthService } from '../auth/auth.service'
import { mediaPermissions } from './media-policy'

test(
  'disposable PostgreSQL/HTTP upload → private review → published GIF; object authorization and withdrawal',
  { timeout: 90_000 },
  async () => {
    const url = process.env.TEST_DATABASE_URL
    assert.ok(url, 'TEST_DATABASE_URL is required; media integration tests never silently skip')
    assert.match(
      new URL(url).pathname,
      /(?:_|\/)(?:test|ci)(?:_|$)/,
      'Only an isolated test database is permitted',
    )
    assert.notEqual(url, process.env.DATABASE_URL, 'Never test on the application database')
    const previousDemoOrganization = process.env.DEMO_FIXTURE_ORGANIZATION_ID
    process.env.MEDIA_ASSETS_DIRECTORY = await mkdtemp(resolve(tmpdir(), 'xiaoqiu-worker-a-media-'))
    process.env.XIAOQIU_FEATURE_GOAL_MEDIA = 'true'
    process.env.NODE_ENV = 'test'
    delete process.env.MEDIA_REVIEW_ALLOW_ORGANIZATION_ADMIN
    const prisma = new PrismaClient({ datasources: { db: { url } } })
    let app: INestApplication | undefined
    const organizationId: string = randomUUID()
    process.env.DEMO_FIXTURE_ORGANIZATION_ID = organizationId
    try {
      await prisma.organization.create({
        data: {
          id: organizationId,
          slug: `fictional-media-${randomUUID()}`,
          name: 'FICTIONAL_MEDIA_TEST',
        },
      })
      const otherOrg = await prisma.organization.create({
        data: { slug: `fictional-other-${randomUUID()}`, name: 'FICTIONAL_OTHER_TEST' },
      })
      const season = await prisma.season.create({
        data: { organizationId, seasonCode: 'MEDIA-TEST', name: 'FICTIONAL_MEDIA_TEST' },
      })
      const tournament = await prisma.tournament.create({
        data: {
          organizationId,
          seasonId: season.id,
          tournamentCode: 'DEMO-GREEN-CUP-2026',
          name: 'FICTIONAL_MEDIA_TEST',
          status: 'PUBLISHED',
        },
      })
      const team = await prisma.team.create({
        data: { organizationId, teamCode: 'MEDIA-A', name: 'FICTIONAL_TEAM_A' },
      })
      const away = await prisma.team.create({
        data: { organizationId, teamCode: 'MEDIA-B', name: 'FICTIONAL_TEAM_B' },
      })
      const match = await prisma.match.create({
        data: {
          organizationId,
          tournamentId: tournament.id,
          matchCode: 'MEDIA-GOAL',
          title: 'FICTIONAL_TEST_GOAL',
          status: 'FINISHED',
          homeTeamId: team.id,
          awayTeamId: away.id,
        },
      })
      const player = await prisma.playerProfile.create({
        data: { organizationId, displayName: '虚构本人球员' },
      })
      const otherPlayer = await prisma.playerProfile.create({
        data: { organizationId, displayName: '虚构其他球员' },
      })
      const goal = await prisma.matchEvent.create({
        data: {
          organizationId,
          matchId: match.id,
          teamId: team.id,
          playerId: player.id,
          type: 'GOAL',
          minute: 12,
        },
      })
      const card = await prisma.matchEvent.create({
        data: {
          organizationId,
          matchId: match.id,
          teamId: team.id,
          type: 'YELLOW_CARD',
          minute: 15,
        },
      })
      const userFixture = async (label: string, org = organizationId, linkedPlayer?: string) => {
        const user = await prisma.user.create({
          data: {
            displayName: `FICTIONAL_${label}`,
            ...(linkedPlayer ? { playerProfileId: linkedPlayer } : {}),
            memberships: { create: { organizationId: org, status: 'ACTIVE' } },
          },
        })
        // Test-created sessions only; no existing credentials/sessions are read or copied.
        const sessionValue = `fictional-${randomUUID()}`
        await prisma.userSession.create({
          data: {
            userId: user.id,
            organizationId: org,
            refreshTokenHash: createHash('sha256').update(sessionValue).digest('hex'),
            expiresAt: new Date(Date.now() + 3_600_000),
          },
        })
        return { user, auth: `Bearer ${sessionValue}` }
      }
      const student = await userFixture('STUDENT', organizationId, player.id)
      const stranger = await userFixture('STRANGER')
      const platform = await userFixture('PLATFORM')
      const futureAdmin = await userFixture('FUTURE_ADMIN')
      const orgAdmin = await userFixture('ORG_ADMIN')
      const reporter = await userFixture('REPORTER')
      const foreign = await userFixture('FOREIGN', otherOrg.id)
      await prisma.roleAssignment.createMany({
        data: [
          {
            userId: platform.user.id,
            role: 'PLATFORM_ADMIN',
            scopeType: 'PLATFORM',
            scopeId: 'PLATFORM',
          },
          {
            userId: futureAdmin.user.id,
            role: 'PLATFORM_ADMIN',
            scopeType: 'PLATFORM',
            scopeId: 'PLATFORM',
            grantedAt: new Date(Date.now() + 86_400_000),
          },
          {
            userId: orgAdmin.user.id,
            organizationId,
            role: 'ORGANIZATION_ADMIN',
            scopeType: 'ORGANIZATION',
            scopeId: organizationId,
          },
          {
            userId: reporter.user.id,
            organizationId,
            role: 'MATCH_REPORTER',
            scopeType: 'MATCH',
            scopeId: match.id,
          },
        ],
      })
      const module = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile()
      app = module.createNestApplication({ logger: false })
      configureApp(app)
      await app.init()
      const http = app.getHttpServer()
      // Exercise the production capability controller and the same freshly loaded roles
      // as upload/moderation, rather than a controller that emulates its response.
      for (const [identity, review, publish] of [
        [student, false, false],
        [reporter, false, false],
        [orgAdmin, true, false],
        [futureAdmin, false, false],
        [platform, true, true],
      ] as const) {
        const caps = await request(http)
          .get('/api/me/capabilities')
          .set('Authorization', identity.auth)
          .expect(200)
        assert.equal(caps.body.organizationId, organizationId)
        assert.equal(caps.body.modules.goalMedia.enabled, true)
        assert.equal(caps.body.actions['goalMedia.submit'].enabled, true)
        assert.equal(caps.body.actions['goalMedia.review'].enabled, review)
        assert.equal(caps.body.actions['goalMedia.publish'].enabled, publish)
      }
      process.env.MEDIA_REVIEW_ALLOW_ORGANIZATION_ADMIN = 'true'
      const organizationReview = await request(http)
        .get('/api/me/capabilities')
        .set('Authorization', orgAdmin.auth)
        .expect(200)
      assert.equal(organizationReview.body.actions['goalMedia.review'].enabled, true)
      assert.equal(organizationReview.body.actions['goalMedia.publish'].enabled, false)
      await request(http)
        .get('/api/admin/media-assets')
        .set('Authorization', orgAdmin.auth)
        .expect(200)
      delete process.env.MEDIA_REVIEW_ALLOW_ORGANIZATION_ADMIN
      const gif = dataUrl(await gifFixture(), 'gif')
      const png = dataUrl(
        await sharp({ create: { width: 128, height: 128, channels: 3, background: '#338866' } })
          .png()
          .toBuffer(),
        'png',
      )
      const payload = {
        purpose: 'GOAL_GIF',
        targetId: goal.id,
        dataUrl: gif,
        clientSubmissionId: randomUUID(),
      }
      await request(http).post('/api/media-assets').send(payload).expect(401)
      const submitted = await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send(payload)
        .expect(201)
      const id = submitted.body.id as string
      assert.equal(submitted.body.status, 'APPROVED')
      assert.equal(submitted.body.awaitingReview, true)
      await request(http).get(`/api/media-assets/${id}/content`).expect(200)
      await request(http)
        .get(`/api/media-assets/${id}/poster`)
        .set('Authorization', stranger.auth)
        .expect(200)
      await request(http)
        .get(`/api/media-assets/${id}/poster`)
        .set('Authorization', student.auth)
        .expect(200)
      await request(http)
        .get(`/api/media-assets/${id}/content`)
        .set('Authorization', platform.auth)
        .expect(200)
      await request(http)
        .get('/api/media-assets/mine')
        .set('Authorization', stranger.auth)
        .expect(200)
        .then((response) => assert.equal(response.body.items.length, 0))
      for (const identity of [student, reporter, foreign, futureAdmin]) {
        await request(http)
          .get('/api/admin/media-assets')
          .set('Authorization', identity.auth)
          .expect(403)
        await request(http)
          .put(`/api/admin/media-assets/${id}/review`)
          .set('Authorization', identity.auth)
          .send({ action: 'APPROVE', expectedVersion: 0 })
          .expect(403)
      }
      await request(http)
        .get(`/api/media-assets/${id}/content`)
        .set('Authorization', futureAdmin.auth)
        .expect(200)
      await request(http)
        .post('/api/media-assets')
        .set('Authorization', futureAdmin.auth)
        .send({ ...payload, clientSubmissionId: randomUUID() })
        .expect(201)
        .then((response) =>
          assert.equal(
            response.body.status,
            'APPROVED',
            'ordinary uploads are visible immediately without review privileges',
          ),
        )
      await request(http)
        .put(`/api/media-assets/${id}/visibility`)
        .set('Authorization', stranger.auth)
        .send({ action: 'DELETE', expectedVersion: 0 })
        .expect(403)
      await request(http)
        .get(`/api/media-assets/${id}/content`)
        .set('Authorization', foreign.auth)
        .expect(404)
      const approved = await request(http)
        .put(`/api/admin/media-assets/${id}/review`)
        .set('Authorization', platform.auth)
        .send({ action: 'APPROVE', expectedVersion: 0 })
        .expect(200)
      assert.equal(approved.body.status, 'APPROVED')
      await request(http)
        .get(`/api/media-assets/${id}/content`)
        .expect(200)
        .expect('Content-Type', /image\/gif/)
        .expect('Cache-Control', 'private, max-age=600')
      const published = await request(http)
        .get(`/api/media-assets/matches/${match.id}/goals`)
        .set('Authorization', student.auth)
        .expect(200)
      assert.equal(published.body.items[0].targetId, goal.id)
      assert.equal(
        published.body.items[0].status,
        undefined,
        'public DTO does not leak moderation details',
      )
      // Retry and concurrent duplicate requests create one durable submission.
      const replay = await Promise.all(
        [1, 2].map(() =>
          request(http)
            .post('/api/media-assets')
            .set('Authorization', student.auth)
            .send(payload)
            .expect(201),
        ),
      )
      assert.ok(replay.every((result) => result.body.id === id))
      await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send({ ...payload, targetId: card.id })
        .expect(409)
      await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send({ ...payload, clientSubmissionId: randomUUID(), targetId: card.id })
        .expect(404)
      await request(http)
        .post('/api/media-assets')
        .set('Authorization', foreign.auth)
        .send({ ...payload, clientSubmissionId: randomUUID() })
        .expect(404)
      await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send({
          ...payload,
          clientSubmissionId: randomUUID(),
          dataUrl: gif.replace('image/gif', 'image/png'),
        })
        .expect(400)
      await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send({ ...payload, clientSubmissionId: randomUUID(), targetId: '../unsafe' })
        .expect(400)
      // Visibility uses compare-and-swap; user cannot undo an administrator withdrawal.
      await request(http)
        .put(`/api/media-assets/${id}/visibility`)
        .set('Authorization', student.auth)
        .send({ action: 'HIDE', expectedVersion: 0 })
        .expect(409)
      await request(http)
        .put(`/api/media-assets/${id}/visibility`)
        .set('Authorization', platform.auth)
        .send({ action: 'HIDE', expectedVersion: 1 })
        .expect(200)
      await request(http).get(`/api/media-assets/${id}/content`).expect(404)
      await request(http)
        .put(`/api/media-assets/${id}/visibility`)
        .set('Authorization', student.auth)
        .send({ action: 'RESTORE', expectedVersion: 2 })
        .expect(403)
      await request(http)
        .put(`/api/media-assets/${id}/visibility`)
        .set('Authorization', platform.auth)
        .send({ action: 'RESTORE', expectedVersion: 2 })
        .expect(200)
      await request(http)
        .put(`/api/media-assets/${id}/visibility`)
        .set('Authorization', student.auth)
        .send({ action: 'DELETE', expectedVersion: 3 })
        .expect(200)
      await request(http).get(`/api/media-assets/${id}/content`).expect(404)
      const savedBytes = await readFile(
        resolve(process.env.MEDIA_ASSETS_DIRECTORY!, organizationId, id, 'content'),
      )
      assert.equal(
        (await new MediaStorage().read(organizationId, id, false)).length,
        savedBytes.length,
        'durable bytes survive adapter recreation and soft deletion',
      )
      await request(http)
        .put(`/api/media-assets/${id}/visibility`)
        .set('Authorization', student.auth)
        .send({ action: 'RESTORE', expectedVersion: 4 })
        .expect(200)
      const photoPayload = {
        purpose: 'PLAYER_PORTRAIT',
        targetId: otherPlayer.id,
        dataUrl: png,
        clientSubmissionId: randomUUID(),
      }
      await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send(photoPayload)
        .expect(403)
      await request(http)
        .post('/api/media-assets')
        .set('Authorization', orgAdmin.auth)
        .send(photoPayload)
        .expect(201)
      const photo = await request(http)
        .post('/api/media-assets')
        .set('Authorization', platform.auth)
        .send(photoPayload)
        .expect(201)
      assert.equal(photo.body.status, 'APPROVED')
      assert.equal(
        (await prisma.playerProfile.findUniqueOrThrow({ where: { id: otherPlayer.id } }))
          .portraitUrl,
        photo.body.contentUrl,
      )
      assert.equal(
        (await prisma.playerProfile.findUniqueOrThrow({ where: { id: otherPlayer.id } })).avatarUrl,
        null,
      )
      const ownPhoto = await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send({ ...photoPayload, targetId: player.id, clientSubmissionId: randomUUID() })
        .expect(201)
      assert.equal(ownPhoto.body.status, 'APPROVED')
      assert.equal(ownPhoto.body.awaitingReview, true)
      assert.equal(
        (await prisma.playerProfile.findUniqueOrThrow({ where: { id: player.id } })).portraitUrl,
        ownPhoto.body.contentUrl,
      )
      const background = await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send({
          purpose: 'USER_BACKGROUND',
          targetId: student.user.id,
          dataUrl: png,
          clientSubmissionId: randomUUID(),
        })
        .expect(201)
      // Post-moderation: the background is live at once and queued for a later check.
      assert.equal(background.body.status, 'APPROVED')
      assert.equal(background.body.awaitingReview, true)
      await request(http)
        .get(`/api/media-assets/users/${student.user.id}/presentation`)
        .set('Authorization', student.auth)
        .expect(200)
        .then((response) => assert.equal(response.body.backgroundUrl, background.body.contentUrl))
      await request(http)
        .get('/api/admin/media-assets')
        .set('Authorization', platform.auth)
        .expect(200)
        .then((response) =>
          assert.equal(
            response.body.items.find((item: { id: string }) => item.id === background.body.id)
              ?.awaitingReview,
            true,
          ),
        )
      await request(http)
        .put(`/api/admin/media-assets/${background.body.id}/review`)
        .set('Authorization', platform.auth)
        .send({ action: 'REJECT', expectedVersion: 0, reason: '图片不适合展示' })
        .expect(200)
      await request(http)
        .get(`/api/media-assets/users/${student.user.id}/presentation`)
        .set('Authorization', student.auth)
        .expect(200)
        .then((response) => assert.equal(response.body.backgroundUrl, null))
      const keptBackground = await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send({
          purpose: 'USER_BACKGROUND',
          targetId: student.user.id,
          dataUrl: png,
          clientSubmissionId: randomUUID(),
        })
        .expect(201)
      await request(http)
        .put(`/api/admin/media-assets/${keptBackground.body.id}/review`)
        .set('Authorization', platform.auth)
        .send({ action: 'APPROVE', expectedVersion: 0 })
        .expect(200)
        .then((response) => assert.equal(response.body.awaitingReview, false))
      await request(http)
        .get(`/api/media-assets/users/${student.user.id}/presentation`)
        .set('Authorization', student.auth)
        .expect(200)
        .then((response) =>
          assert.equal(response.body.backgroundUrl, keptBackground.body.contentUrl),
        )
      await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send({
          purpose: 'USER_AVATAR',
          targetId: stranger.user.id,
          dataUrl: png,
          clientSubmissionId: randomUUID(),
        })
        .expect(403)
      const ownAvatar = await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send({
          purpose: 'USER_AVATAR',
          targetId: student.user.id,
          dataUrl: png,
          clientSubmissionId: randomUUID(),
        })
        .expect(201)
      assert.equal(ownAvatar.body.status, 'APPROVED')
      assert.equal(ownAvatar.body.awaitingReview, true)
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: student.user.id } })).avatarUrl,
        ownAvatar.body.contentUrl,
      )
      await request(http)
        .put(`/api/admin/media-assets/${ownAvatar.body.id}/review`)
        .set('Authorization', platform.auth)
        .send({ action: 'APPROVE', expectedVersion: 0 })
        .expect(200)
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: student.user.id } })).avatarUrl,
        ownAvatar.body.contentUrl,
      )
      assert.equal(
        (await prisma.playerProfile.findUniqueOrThrow({ where: { id: player.id } })).avatarUrl,
        null,
        'account avatar does not overwrite player identity',
      )
      await request(http)
        .put(`/api/media-assets/${ownAvatar.body.id}/visibility`)
        .set('Authorization', student.auth)
        .send({ action: 'HIDE', expectedVersion: 1 })
        .expect(200)
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: student.user.id } })).avatarUrl,
        null,
      )
      await request(http)
        .put(`/api/media-assets/${ownAvatar.body.id}/visibility`)
        .set('Authorization', student.auth)
        .send({ action: 'RESTORE', expectedVersion: 2 })
        .expect(200)
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: student.user.id } })).avatarUrl,
        ownAvatar.body.contentUrl,
      )
      const rejected = await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send({ ...payload, clientSubmissionId: randomUUID() })
        .expect(201)
      await request(http)
        .put(`/api/admin/media-assets/${rejected.body.id}/review`)
        .set('Authorization', platform.auth)
        .send({ action: 'REJECT', expectedVersion: 0 })
        .expect(400)
      await request(http)
        .put(`/api/admin/media-assets/${rejected.body.id}/review`)
        .set('Authorization', platform.auth)
        .send({ action: 'REJECT', expectedVersion: 0, reason: '画面与进球不符' })
        .expect(200)
      const mine = await request(http)
        .get('/api/media-assets/mine')
        .set('Authorization', student.auth)
        .expect(200)
      assert.equal(
        mine.body.items.find((row: { id: string }) => row.id === rejected.body.id).reviewReason,
        '画面与进球不符',
      )
      await request(http).get(`/api/media-assets/${rejected.body.id}/content`).expect(404)
      // In-place changes invalidate signatures; deletion/recreation NEVER maps to a look-alike event.
      await prisma.matchEvent.update({ where: { id: goal.id }, data: { minute: 13 } })
      await request(http).get(`/api/media-assets/${id}/content`).expect(404)
      await request(http)
        .get(`/api/media-assets/matches/${match.id}/goals`)
        .set('Authorization', student.auth)
        .expect(200)
        .then((response) => assert.equal(response.body.items.length, 0))
      await prisma.matchEvent.delete({ where: { id: goal.id } })
      const replacement = await prisma.matchEvent.create({
        data: {
          organizationId,
          matchId: match.id,
          teamId: team.id,
          playerId: player.id,
          type: 'GOAL',
          minute: 12,
        },
      })
      await request(http)
        .put(`/api/admin/media-assets/${rejected.body.id}/review`)
        .set('Authorization', platform.auth)
        .send({ action: 'APPROVE', expectedVersion: 1 })
        .expect(404)
      const direct = await request(http)
        .post('/api/media-assets')
        .set('Authorization', platform.auth)
        .send({ ...payload, targetId: replacement.id, clientSubmissionId: randomUUID() })
        .expect(201)
      assert.equal(direct.body.status, 'APPROVED')
      await prisma.roleAssignment.updateMany({
        where: { userId: platform.user.id },
        data: { revokedAt: new Date() },
      })
      await request(http)
        .get('/api/admin/media-assets')
        .set('Authorization', platform.auth)
        .expect(403)
      process.env.XIAOQIU_FEATURE_GOAL_MEDIA = 'false'
      const flags = await request(http)
        .get('/api/me/capabilities')
        .set('Authorization', student.auth)
        .expect(200)
      assert.equal(flags.body.modules.goalMedia.enabled, false)
      assert.equal(flags.body.actions['goalMedia.submit'].reason, '功能暂未开放')
      assert.equal(
        mediaPermissions(
          await new AuthService(prisma as PrismaService).requireSession(student.auth),
        ).canSubmit,
        true,
        'feature switch does not revoke identity permission',
      )
      await request(http)
        .post('/api/media-assets')
        .set('Authorization', student.auth)
        .send({ ...payload, clientSubmissionId: randomUUID() })
        .expect(403)
        .then((response) => assert.equal(response.body.message, '功能暂未开放'))
      await request(http).get(`/api/media-assets/${direct.body.id}/content`).expect(403)
      await request(http)
        .put(`/api/media-assets/${direct.body.id}/visibility`)
        .set('Authorization', platform.auth)
        .send({ action: 'DELETE', expectedVersion: 0 })
        .expect(200)
      assert.ok(
        (await prisma.auditLog.count({
          where: { organizationId, targetType: 'ManagedMediaAsset' },
        })) === 21,
      )
      await assert.rejects(new MediaStorage().read('../unsafe', id, false))
    } finally {
      if (app) await app.close()
      await prisma.$disconnect()
      delete process.env.MEDIA_ASSETS_DIRECTORY
      delete process.env.XIAOQIU_FEATURE_GOAL_MEDIA
      if (previousDemoOrganization === undefined) delete process.env.DEMO_FIXTURE_ORGANIZATION_ID
      else process.env.DEMO_FIXTURE_ORGANIZATION_ID = previousDemoOrganization
    }
  },
)
