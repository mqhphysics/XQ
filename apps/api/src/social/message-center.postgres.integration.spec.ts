import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient, type AiModerationReview } from '../generated/prisma/client'
import { hashPassword } from '../auth/password'
import { createAdminNotice } from './admin-notice'
import { AiModerationService } from '../ai-moderation/ai-moderation.service'

test(
  'message center HTTP: grouped likes, reminder preferences, exact unread, blocks and durable favorite cursors',
  { timeout: 90000 },
  async (t) => {
    const url = process.env.TEST_DATABASE_URL!
    assert.match(new URL(url).pathname, /_test_/)
    assert.notEqual(url, process.env.DATABASE_URL)
    const db = new PrismaClient({ datasources: { db: { url } } })
    const suffix = randomUUID()
    const org = await db.organization.create({
      data: { slug: 'inbox-test-' + suffix, name: 'FICTIONAL_TEST 消息' },
    })
    const foreign = await db.organization.create({
      data: { slug: 'inbox-foreign-' + suffix, name: 'FICTIONAL_TEST 外部' },
    })
    const season = await db.season.create({
      data: { organizationId: org.id, seasonCode: suffix, name: 'FICTIONAL_TEST' },
    })
    const tournament = await db.tournament.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        tournamentCode: suffix,
        name: 'FICTIONAL_TEST',
        status: 'PUBLISHED',
      },
    })
    const credential = await hashPassword('Fictional-Inbox-090!')
    const users = await Promise.all(
      [org, org, org, foreign].map((organization, index) =>
        db.user.create({
          data: {
            displayName: `FICTIONAL_TEST ${index}`,
            loginNameNormalized: `inbox-${suffix}-${index}`,
            memberships: { create: { organizationId: organization.id, status: 'ACTIVE' } },
            passwordCredential: {
              create: { passwordHash: credential.hash, passwordSalt: credential.salt },
            },
          },
        }),
      ),
    )
    const player = await db.playerProfile.create({
      data: { organizationId: org.id, displayName: 'FICTIONAL_TEST 已关注球员' },
    })
    await db.user.update({ where: { id: users[0]!.id }, data: { playerProfileId: player.id } })
    const team = await db.team.create({
      data: {
        organizationId: org.id,
        teamCode: 'MENTION-' + suffix,
        name: 'FICTIONAL_TEST 提及球队',
      },
    })
    const registration = await db.teamRegistration.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        teamId: team.id,
        status: 'APPROVED',
      },
    })
    const submission = await db.rosterSubmission.create({
      data: {
        organizationId: org.id,
        teamRegistrationId: registration.id,
        submissionVersion: 1,
        status: 'DRAFT',
        sourceFileHash: 'a'.repeat(64),
      },
    })
    const snapshot = await db.rosterSnapshot.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        teamId: team.id,
        teamRegistrationId: registration.id,
        rosterSubmissionId: submission.id,
        snapshotVersion: 1,
        sourceFileHash: 'a'.repeat(64),
      },
    })
    await db.rosterSnapshotEntry.create({
      data: {
        organizationId: org.id,
        rosterSnapshotId: snapshot.id,
        playerProfileId: player.id,
        displayName: player.displayName,
        shirtNumber: '8',
        sortOrder: 0,
      },
    })
    await db.rosterSubmission.update({
      where: { id: submission.id },
      data: { status: 'LOCKED', lockedAt: new Date() },
    })
    await db.rosterSnapshot.update({ where: { id: snapshot.id }, data: { lockedAt: new Date() } })
    const post = await db.post.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        authorUserId: users[1]!.id,
        body: 'FICTIONAL_TEST 被点赞动态',
        status: 'PUBLISHED',
      },
    })
    const otherPost = await db.post.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        authorUserId: users[0]!.id,
        body: 'FICTIONAL_TEST 隐藏作者',
        status: 'PUBLISHED',
      },
    })
    const ownComment = await db.postComment.create({
      data: {
        organizationId: org.id,
        postId: post.id,
        userId: users[1]!.id,
        body: 'FICTIONAL_TEST 评论目标',
      },
    })
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile()
    const app = module.createNestApplication({ logger: false })
    configureApp(app)
    await app.init()
    const http = request(app.getHttpServer())
    try {
      const tokens = await Promise.all(
        users.map(async (user, index) => {
          const result = await http
            .post('/api/auth/login')
            .set('x-organization-id', index === 3 ? foreign.id : org.id)
            .send({ username: user.loginNameNormalized, password: 'Fictional-Inbox-090!' })
            .expect(200)
          return `Bearer ${result.body.accessToken}`
        }),
      )
      const summary = async () =>
        (
          await http
            .get('/api/me/message-center/summary')
            .set('authorization', tokens[1]!)
            .expect(200)
        ).body
      const messageId = randomUUID()
      const send = () =>
        http
          .post(`/api/messages/direct/${users[1]!.id}`)
          .set('authorization', tokens[0]!)
          .send({ body: 'FICTIONAL_TEST 私信', clientMessageId: messageId })
      const sent = await send().expect(201)
      assert.equal((await send().expect(201)).body.message.id, sent.body.message.id)
      await http
        .get('/api/messages/conversations/' + sent.body.conversationId)
        .set('authorization', tokens[2]!)
        .expect(404)
      await http
        .post(`/api/messages/direct/${users[3]!.id}`)
        .set('authorization', tokens[0]!)
        .send({ body: 'foreign', clientMessageId: randomUUID() })
        .expect(404)
      await http
        .post(`/api/messages/direct/${users[1]!.id}`)
        .set('authorization', tokens[0]!)
        .send({ body: 'spoof', clientMessageId: randomUUID(), kind: 'ADMIN_NOTICE' })
        .expect(400)
      for (const index of [0, 2])
        await http
          .put(`/api/community/posts/${post.id}/like`)
          .set('authorization', tokens[index]!)
          .expect(200)
      await http
        .put(`/api/community/posts/${post.id}/comments/${ownComment.id}/like`)
        .set('authorization', tokens[0]!)
        .expect(200)
      const comment = await http
        .post(`/api/community/posts/${post.id}/comments`)
        .set('authorization', tokens[0]!)
        .send({ body: 'FICTIONAL_TEST 评论', clientCommentId: randomUUID() })
        .expect(201)
      const initial = await summary()
      assert.equal(initial.directUnreadCount, 1)
      assert.equal(initial.badgeCount, 1)
      assert.equal(initial.likesUnreadCount, 3)
      assert.equal(initial.repliesUnreadCount, 1)
      const likes = (
        await http
          .get('/api/me/message-center/notifications?category=likes')
          .set('authorization', tokens[1]!)
          .expect(200)
      ).body.items
      assert.equal(likes.length, 2)
      const grouped = likes.find(
        (item: { target: { kind: string } }) => item.target?.kind === 'POST',
      )
      assert.equal(grouped.actorCount, 2)
      assert.equal(grouped.actors.length, 2)
      assert.equal(
        likes.find((item: { target: { kind: string } }) => item.target?.kind === 'COMMENT').target
          .excerpt,
        ownComment.body,
      )
      await http
        .put(`/api/me/message-center/groups/${grouped.id}/read`)
        .set('authorization', tokens[3]!)
        .expect(404)
      await http
        .put(`/api/me/message-center/groups/${grouped.id}/read`)
        .set('authorization', tokens[1]!)
        .expect(200)
      assert.equal((await summary()).likesUnreadCount, 1)
      await http.put('/api/me/message-center/read-all').set('authorization', tokens[1]!).expect(200)
      assert.equal((await summary()).directUnreadCount, 0)
      assert.equal(
        await db.directMessage.count({
          where: { conversationId: sent.body.conversationId, readAt: null },
        }),
        0,
      )
      await db.userPlayerFollow.create({
        data: { organizationId: org.id, userId: users[1]!.id, playerProfileId: player.id },
      })
      const prefs = {
        likes: 'NONE',
        replies: 'FOLLOWING',
        directMessages: true,
        systemMessages: true,
        badges: true,
        expectedVersion: 0,
      }
      const saved = await http
        .put('/api/me/message-preferences')
        .set('authorization', tokens[1]!)
        .send(prefs)
        .expect(200)
      await http
        .put('/api/me/message-preferences')
        .set('authorization', tokens[1]!)
        .send(prefs)
        .expect(409)
      for (const index of [0, 2])
        await http
          .post(`/api/community/posts/${post.id}/comments`)
          .set('authorization', tokens[index]!)
          .send({ body: 'FICTIONAL_TEST 提醒过滤 ' + index, clientCommentId: randomUUID() })
          .expect(201)
      assert.equal((await summary()).repliesUnreadCount, 1)
      const replies = (
        await http
          .get('/api/me/message-center/notifications?category=replies')
          .set('authorization', tokens[1]!)
          .expect(200)
      ).body.items
      assert.equal(replies.length, 3)
      await http
        .put('/api/me/message-preferences')
        .set('authorization', tokens[1]!)
        .send({ ...prefs, likes: 'ALL', replies: 'ALL', expectedVersion: saved.body.version })
        .expect(200)
      await http
        .put(`/api/me/blocked-users/${users[1]!.id}`)
        .set('authorization', tokens[1]!)
        .expect(409)
      await http
        .put(`/api/me/blocked-users/${users[3]!.id}`)
        .set('authorization', tokens[1]!)
        .expect(404)
      await http
        .put(`/api/me/blocked-users/${users[0]!.id}`)
        .set('authorization', tokens[1]!)
        .expect(200)
      const blockedNotice = await db.userNotification.findFirstOrThrow({
        where: {
          recipientUserId: users[1]!.id,
          deduplicationKey: `post-comment:${comment.body.id}`,
        },
      })
      await http
        .get(`/api/me/notifications/${blockedNotice.id}`)
        .set('authorization', tokens[1]!)
        .expect(404)
      await http
        .post(`/api/messages/direct/${users[1]!.id}`)
        .set('authorization', tokens[0]!)
        .send({ body: 'blocked', clientMessageId: randomUUID() })
        .expect(403)
      await http
        .post(`/api/community/posts/${post.id}/comments`)
        .set('authorization', tokens[0]!)
        .send({ body: 'blocked', clientCommentId: randomUUID() })
        .expect(403)
      const detail = await http
        .get('/api/public/posts/' + post.id)
        .set('authorization', tokens[1]!)
        .set('x-organization-id', org.id)
        .expect(200)
      assert.equal(
        detail.body.comments.some((item: { id: string }) => item.id === comment.body.id),
        false,
      )
      await http
        .get('/api/public/posts/' + otherPost.id)
        .set('authorization', tokens[1]!)
        .set('x-organization-id', org.id)
        .expect(404)
      const home = await http
        .get('/api/public/home?tournamentId=' + tournament.id)
        .set('authorization', tokens[1]!)
        .set('x-organization-id', org.id)
        .expect(200)
      assert.equal(
        home.body.posts.some((item: { id: string }) => item.id === otherPost.id),
        false,
      )
      const search = await http
        .get(
          '/api/public/search?query=' +
            encodeURIComponent('隐藏作者') +
            '&category=POST&tournamentId=' +
            tournament.id,
        )
        .set('authorization', tokens[1]!)
        .set('x-organization-id', org.id)
        .expect(200)
      assert.equal(search.body.posts.length, 0)
      const notice = {
        organizationId: org.id,
        senderUserId: users[0]!.id,
        recipientUserId: users[1]!.id,
        clientMessageId: 'notice-' + randomUUID(),
        title: '资料核验通知',
        body: '请核对资料',
        applicationId: randomUUID(),
        deadlineAt: new Date(Date.now() + 14 * 86400000).toISOString(),
        actionPath: '/pages/me/index?profile=information&correction=1',
      }
      const official = await db.$transaction((tx) => createAdminNotice(tx, notice))
      assert.equal(
        (await db.$transaction((tx) => createAdminNotice(tx, notice))).messageId,
        official.messageId,
      )
      const thread = await http
        .get('/api/messages/conversations/' + official.conversationId)
        .set('authorization', tokens[1]!)
        .expect(200)
      assert.equal(thread.body.conversation.blocked, true)
      assert.equal(
        thread.body.items.find((item: { id: string }) => item.id === official.messageId).kind,
        'ADMIN_NOTICE',
      )
      assert.equal((await summary()).directUnreadCount, 1)
      const at = new Date('2026-11-01T12:00:00Z')
      const favorites = await Promise.all(
        Array.from({ length: 34 }, async (_, i) => {
          const item = await db.post.create({
            data: {
              organizationId: org.id,
              tournamentId: tournament.id,
              authorUserId: users[1]!.id,
              body: 'FICTIONAL_TEST 收藏 ' + i,
              status: 'PUBLISHED',
            },
          })
          return db.postFavorite.create({
            data: { organizationId: org.id, userId: users[1]!.id, postId: item.id, createdAt: at },
          })
        }),
      )
      const first = await http
        .get('/api/me/favorite-posts')
        .set('authorization', tokens[1]!)
        .expect(200)
      assert.equal(first.body.items.length, 30)
      assert.equal(first.body.totalCount, 34)
      const anchor = JSON.parse(
        Buffer.from(first.body.nextCursor, 'base64url').toString('utf8'),
      ) as { id: string }
      assert.ok(favorites.some((item) => item.id === anchor.id))
      await db.postFavorite.delete({ where: { id: anchor.id } })
      const tail = await http
        .get('/api/me/favorite-posts?before=' + first.body.nextCursor)
        .set('authorization', tokens[1]!)
        .expect(200)
      assert.equal(tail.body.items.length, 4)
      assert.equal(tail.body.totalCount, 33)
      await http
        .get('/api/me/favorite-posts?before=' + first.body.nextCursor)
        .set('authorization', tokens[3]!)
        .expect(400)
      const hiddenComment = await db.postComment.create({
        data: {
          organizationId: org.id,
          postId: post.id,
          userId: users[2]!.id,
          body: 'FICTIONAL_TEST 不可见评论正文',
          hiddenAt: new Date(),
        },
      })
      const oldNotice = await db.userNotification.create({
        data: {
          organizationId: org.id,
          recipientUserId: users[1]!.id,
          actorUserId: users[2]!.id,
          type: 'POST_COMMENTED',
          title: '旧评论',
          body: hiddenComment.body,
          linkPath: `/pages/post-detail/index?postId=${post.id}`,
          deduplicationKey: `post-comment:${hiddenComment.id}`,
        },
      })
      const unavailable = (
        await http
          .get('/api/me/message-center/notifications?category=replies')
          .set('authorization', tokens[1]!)
          .expect(200)
      ).body.items.find((item: { id: string }) => item.id === oldNotice.id)
      assert.equal(unavailable.target, null)
      assert.equal(unavailable.linkPath, null)
      assert.equal(unavailable.body.includes(hiddenComment.body), false)
      const legacyUnavailable = (
        await http
          .get(`/api/me/notifications/${oldNotice.id}`)
          .set('authorization', tokens[1]!)
          .expect(200)
      ).body
      assert.equal(legacyUnavailable.linkPath, null)
      assert.equal(legacyUnavailable.body.includes(hiddenComment.body), false)
      await db.postComment.update({ where: { id: hiddenComment.id }, data: { hiddenAt: null } })
      const restored = (
        await http
          .get('/api/me/message-center/notifications?category=replies')
          .set('authorization', tokens[1]!)
          .expect(200)
      ).body.items.find((item: { id: string }) => item.id === oldNotice.id)
      assert.equal(restored.target.commentId, hiddenComment.id)
      await http
        .delete(`/api/me/blocked-users/${users[0]!.id}`)
        .set('authorization', tokens[1]!)
        .expect(200)
      await http
        .post(`/api/messages/direct/${users[1]!.id}`)
        .set('authorization', tokens[0]!)
        .send({ body: 'FICTIONAL_TEST 解除后可联系', clientMessageId: randomUUID() })
        .expect(201)
      const groupedPostIds: string[] = Array.from({ length: 51 }, () => randomUUID()),
        stamp = new Date('2026-11-01T00:00:00Z')
      await db.post.createMany({
        data: groupedPostIds.map((id) => ({
          id,
          organizationId: org.id,
          tournamentId: tournament.id,
          authorUserId: users[1]!.id,
          body: 'FICTIONAL_TEST 分页点赞',
          status: 'PUBLISHED' as const,
        })),
      })
      const likeRows = groupedPostIds.flatMap((postId) =>
        [users[0]!, users[2]!].map((user) => ({
          id: randomUUID(),
          organizationId: org.id,
          postId,
          userId: user.id,
          createdAt: stamp,
        })),
      )
      await db.postLike.createMany({ data: likeRows })
      await db.userNotification.createMany({
        data: likeRows.map((like) => ({
          organizationId: org.id,
          recipientUserId: users[1]!.id,
          actorUserId: like.userId,
          type: 'POST_LIKED' as const,
          title: '分页点赞',
          body: 'FICTIONAL_TEST',
          linkPath: `/pages/post-detail/index?postId=${like.postId}`,
          metadata: { postId: like.postId, targetKind: 'POST' },
          deduplicationKey: `post-like:${like.id}`,
          createdAt: stamp,
        })),
      })
      const seen: string[] = []
      let cursor: string | null = null
      for (let index = 0; index < 4; index++) {
        const page: {
          items: Array<{ target: { postId: string } | null; actorCount: number; actors: unknown[] }>
          nextCursor: string | null
        } = (
          await http
            .get(
              '/api/me/message-center/notifications?category=likes' +
                (cursor ? '&before=' + cursor : ''),
            )
            .set('authorization', tokens[1]!)
            .expect(200)
        ).body
        for (const row of page.items) {
          if (row.target && groupedPostIds.includes(row.target.postId)) {
            seen.push(row.target.postId)
            assert.equal(row.actorCount, 2)
            assert.equal(row.actors.length, 2)
          }
        }
        cursor = page.nextCursor
        if (!cursor) break
      }
      assert.equal(seen.length, 51)
      assert.equal(new Set(seen).size, 51)
      const moderation = app.get(AiModerationService)
      t.mock.method(moderation, 'requiresPreReview', async () => true)
      t.mock.method(moderation, 'enqueue', async () => undefined)
      const pendingResponse = await http
        .post('/api/community/posts')
        .set('authorization', tokens[2]!)
        .send({
          clientPostId: randomUUID(),
          body: 'FICTIONAL_TEST 待审提及',
          tournamentId: tournament.id,
          tags: [{ kind: 'PLAYER', targetId: player.id }],
        })
      assert.equal(pendingResponse.status, 201, JSON.stringify(pendingResponse.body))
      const pending = pendingResponse.body
      assert.equal(pending.publicationState, 'PENDING_REVIEW')
      const mentionKey = `post-mentioned:${pending.id}:${users[0]!.id}`
      assert.equal(await db.userNotification.count({ where: { deduplicationKey: mentionKey } }), 0)
      const pendingRow = await db.post.findUniqueOrThrow({ where: { id: pending.id } })
      await db.$transaction((tx) =>
        moderation.apply(
          tx,
          {
            id: randomUUID(),
            resourceType: 'POST',
            organizationId: org.id,
            targetId: pending.id,
          } as AiModerationReview,
          true,
          {
            text: pendingRow.body,
            urls: [],
            ownerId: users[2]!.id,
            version: pendingRow.updatedAt.toISOString(),
            purpose: 'POST',
            animated: false,
          },
        ),
      )
      assert.equal(await db.userNotification.count({ where: { deduplicationKey: mentionKey } }), 1)
    } finally {
      await app.close()
      await db.$disconnect()
    }
  },
)
