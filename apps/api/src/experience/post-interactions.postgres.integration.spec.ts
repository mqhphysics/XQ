import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaClient } from '../generated/prisma/client'
import { seedDemoFixture } from '../database/seed-demo-fixture'
import { SocialService } from '../social/social.service'

test(
  'post interactions persist with ownership, version, quote visibility and tenant checks',
  { skip: !process.env.TEST_DATABASE_URL, timeout: 180_000 },
  async (t) => {
    const configuredUrl = process.env.TEST_DATABASE_URL!
    const url = new URL(configuredUrl)
    assert.match(decodeURIComponent(url.pathname.slice(1)), /(?:^|_)(?:test|ci)(?:_|$)/)
    const schema = `post_interactions_test_${randomUUID().slice(0, 8)}`
    const admin = new PrismaClient({ datasources: { db: { url: configuredUrl } } })
    const previousDatabase = process.env.DATABASE_URL
    const previousTournament = process.env.DEFAULT_TOURNAMENT_ID
    let app: INestApplication | undefined
    let prisma: PrismaClient | undefined
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    try {
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
        { env: process.env, encoding: 'utf8', timeout: 30_000, windowsHide: true },
      )
      assert.equal(migration.status, 0, migration.stdout + migration.stderr)
      prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } })
      await seedDemoFixture(prisma)
      const org = '00000000-0000-4000-8000-000000000001'
      const tournament = await prisma.tournament.findFirstOrThrow({
        where: { organizationId: org, tournamentCode: 'DEMO-GREEN-CUP-2026' },
      })
      process.env.DEFAULT_TOURNAMENT_ID = tournament.id
      const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
      app = module.createNestApplication()
      configureApp(app)
      await app.init()
      const server = app.getHttpServer()
      const student = (
        await request(server)
          .post('/api/auth/login')
          .send({ username: 'student', password: 'Xiaoqiu2026!' })
          .expect(200)
      ).body
      const captain = (
        await request(server)
          .post('/api/auth/login')
          .send({ username: 'captain', password: 'Xiaoqiu2026!' })
          .expect(200)
      ).body
      const http = (
        method: 'get' | 'post' | 'put' | 'patch' | 'delete',
        path: string,
        session = student,
      ) => {
        const client = request(server)
        return client[method]('/api' + path).set('Authorization', `Bearer ${session.accessToken}`)
      }
      const payload = {
        clientPostId: `post-${randomUUID()}`,
        body: 'FICTIONAL_TEST 原动态',
        tournamentId: tournament.id,
      }
      let post = (await http('post', '/community/posts').send(payload).expect(201)).body
      const base = `/community/posts/${post.id}`
      let comment = (
        await http('post', base + '/comments', captain)
          .send({ clientCommentId: `comment-${randomUUID()}`, body: 'FICTIONAL_TEST 评论' })
          .expect(201)
      ).body
      const commentBase = base + '/comments/' + comment.id

      await t.test(
        'comment sync publishes one untagged quote atomically and rejects option changes on retries',
        async () => {
          const input = {
            clientCommentId: `sync-${randomUUID()}`,
            body: 'FICTIONAL_TEST 评论同步动态',
            parentCommentId: comment.id,
            repostToFeed: true,
          }
          const responses = await Promise.all([
            http('post', base + '/comments', captain)
              .send(input)
              .expect(201),
            http('post', base + '/comments', captain)
              .send(input)
              .expect(201),
          ])
          const synced = responses[0]!.body
          assert.equal(responses[1]!.body.id, synced.id)
          assert.equal(responses[1]!.body.repostedPost.id, synced.repostedPost.id)
          assert.equal(synced.parentCommentId, comment.id)
          assert.equal(synced.repostedPost.quotedPostId, post.id)
          assert.equal(synced.repostedPost.body, input.body)
          assert.deepEqual(synced.repostedPost.tags, [])
          assert.equal(synced.repostedPost.team, null)
          assert.equal(
            await prisma!.post.count({ where: { clientPostId: `comment-repost:${synced.id}` } }),
            1,
          )
          assert.equal(
            await prisma!.postComment.count({ where: { clientCommentId: input.clientCommentId } }),
            1,
          )
          assert.equal(
            await prisma!.auditLog.count({
              where: { targetId: synced.repostedPost.id, action: 'COMMUNITY_POST_CREATED' },
            }),
            1,
          )
          await http('post', base + '/comments', captain)
            .send({ ...input, repostToFeed: false })
            .expect(409)
          await http('post', base + '/comments', captain)
            .send({
              clientCommentId: comment.clientCommentId ?? 'unused-key',
              body: comment.body,
              repostToFeed: 'yes',
            })
            .expect(400)
          const normalInput = {
            clientCommentId: `normal-${randomUUID()}`,
            body: 'FICTIONAL_TEST 普通评论不转发',
          }
          const normal = (
            await http('post', base + '/comments')
              .send(normalInput)
              .expect(201)
          ).body
          assert.equal(normal.repostedPost, undefined)
          assert.equal(
            await prisma!.post.count({ where: { clientPostId: `comment-repost:${normal.id}` } }),
            0,
          )
          await http('post', base + '/comments')
            .send({ ...normalInput, repostToFeed: true })
            .expect(409)
        },
      )

      await t.test(
        'a failed notification rolls back both the comment and synchronized post',
        async () => {
          const social = app!.get(SocialService)
          const originalNotify = social.notify
          social.notify = async () => {
            throw new Error('FICTIONAL_TEST notification persistence failure')
          }
          const clientCommentId = `rollback-${randomUUID()}`
          const beforePosts = await prisma!.post.count()
          try {
            await http('post', base + '/comments', captain)
              .send({ clientCommentId, body: 'FICTIONAL_TEST 原子回滚验证', repostToFeed: true })
              .expect(500)
            assert.equal(await prisma!.postComment.count({ where: { clientCommentId } }), 0)
            assert.equal(await prisma!.post.count(), beforePosts)
            assert.equal(await prisma!.auditLog.count({ where: { requestId: clientCommentId } }), 0)
          } finally {
            social.notify = originalNotify
          }
        },
      )

      await t.test(
        'post and comment likes and post-only favorites survive reads, retries and cancellation',
        async () => {
          await http('put', base + '/like', captain).expect(200)
          await http('put', base + '/favorite').expect(200)
          await http('put', base + '/favorite').expect(200)
          await Promise.all([
            http('put', commentBase + '/like').expect(200),
            http('put', commentBase + '/like').expect(200),
          ])
          const read = (await http('get', `/public/posts/${post.id}`).expect(200)).body
          assert.equal(read.likeCount, 1)
          assert.equal(read.favoritedByMe, true)
          assert.equal(read.comments[0].likeCount, 1)
          assert.equal(read.comments[0].likedByMe, true)
          assert.equal(
            (await http('get', `/public/posts/${post.id}`, captain).expect(200)).body.favoritedByMe,
            false,
          )
          assert.equal(await prisma!.postFavorite.count({ where: { postId: post.id } }), 1)
          await http('put', commentBase + '/favorite').expect(404)
          await http('delete', commentBase + '/like').expect(200)
          await http('delete', base + '/favorite').expect(200)
          const cancelled = (await http('get', `/public/posts/${post.id}`).expect(200)).body
          assert.equal(cancelled.favoritedByMe, false)
          assert.equal(cancelled.comments[0].likeCount, 0)
        },
      )
      await t.test(
        'only authors can edit/delete, self-reports fail, stale versions do not overwrite',
        async () => {
          await http('patch', base, captain)
            .send({ body: '越权', expectedUpdatedAt: post.updatedAt })
            .expect(403)
          await http('delete', base, captain)
            .send({ expectedUpdatedAt: post.updatedAt })
            .expect(403)
          await http('patch', commentBase)
            .send({ body: '越权', expectedUpdatedAt: comment.updatedAt })
            .expect(403)
          await http('delete', commentBase)
            .send({ expectedUpdatedAt: comment.updatedAt })
            .expect(403)
          await http('post', '/reports')
            .send({
              clientReportId: `report-${randomUUID()}`,
              targetType: 'POST',
              targetId: post.id,
              reason: 'FICTIONAL_TEST 本人投诉',
            })
            .expect(404)
          await http('post', '/reports', captain)
            .send({
              clientReportId: `report-${randomUUID()}`,
              targetType: 'COMMENT',
              targetId: comment.id,
              reason: 'FICTIONAL_TEST 本人投诉',
            })
            .expect(404)
          const oldVersion = post.updatedAt
          const attempts = await Promise.all([
            http('patch', base).send({
              body: 'FICTIONAL_TEST 新正文一',
              expectedUpdatedAt: oldVersion,
            }),
            http('patch', base).send({
              body: 'FICTIONAL_TEST 新正文二',
              expectedUpdatedAt: oldVersion,
            }),
          ])
          assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409])
          post = (await http('get', `/public/posts/${post.id}`).expect(200)).body
          await http('delete', base).send({ expectedUpdatedAt: oldVersion }).expect(409)
          comment = (
            await http('patch', commentBase, captain)
              .send({ body: 'FICTIONAL_TEST 已编辑评论', expectedUpdatedAt: comment.updatedAt })
              .expect(200)
          ).body
          assert.equal(comment.body, 'FICTIONAL_TEST 已编辑评论')
        },
      )
      await t.test(
        'quotes persist, original content is read from the server and hidden originals are redacted',
        async () => {
          const quotePayload = {
            clientPostId: `quote-${randomUUID()}`,
            body: '',
            quotedPostId: post.id,
            tournamentId: tournament.id,
          }
          const quote = (
            await http('post', '/community/posts', captain).send(quotePayload).expect(201)
          ).body
          assert.equal(quote.quotedPost.body, post.body)
          assert.equal(quote.quotedPost.author.id, student.user.id)
          assert.equal(
            (await http('post', '/community/posts', captain).send(quotePayload).expect(201)).body
              .id,
            quote.id,
          )
          await http('delete', base).send({ expectedUpdatedAt: post.updatedAt }).expect(200)
          await http('delete', base).send({ expectedUpdatedAt: post.updatedAt }).expect(200)
          const read = (await http('get', `/public/posts/${quote.id}`).expect(200)).body
          assert.equal(read.quotedPostId, post.id)
          assert.equal(read.quotedPost, null)
          await http('post', '/community/posts', captain)
            .send({ ...quotePayload, clientPostId: `hidden-${randomUUID()}` })
            .expect(404)
          await http('put', base + '/favorite').expect(404)
          await http('put', commentBase + '/like').expect(404)
          await http('get', `/public/posts/${post.id}`).expect(404)
        },
      )
      await t.test(
        'foreign organization targets cannot be quoted, favorited or liked',
        async () => {
          const otherOrg = await prisma!.organization.create({
            data: { slug: `fictional-feed-${randomUUID()}`, name: 'FICTIONAL_TEST 隔离组织' },
          })
          const foreign = await prisma!.post.create({
            data: { organizationId: otherOrg.id, body: 'FICTIONAL_TEST 外部组织内容' },
          })
          const foreignComment = await prisma!.postComment.create({
            data: {
              organizationId: otherOrg.id,
              postId: foreign.id,
              userId: captain.user.id,
              body: 'FICTIONAL_TEST 外部评论',
            },
          })
          await http('put', `/community/posts/${foreign.id}/favorite`).expect(404)
          await http(
            'put',
            `/community/posts/${foreign.id}/comments/${foreignComment.id}/like`,
          ).expect(404)
          await http('post', '/community/posts')
            .send({
              body: '转发',
              quotedPostId: foreign.id,
              clientPostId: `foreign-${randomUUID()}`,
            })
            .expect(404)
        },
      )
      await t.test(
        'comment deletion preserves replies and writes one audit on retries',
        async () => {
          const visible = (
            await http('post', '/community/posts')
              .send({ ...payload, clientPostId: `visible-${randomUUID()}` })
              .expect(201)
          ).body
          const root = (
            await http('post', `/community/posts/${visible.id}/comments`, captain)
              .send({ clientCommentId: `root-${randomUUID()}`, body: 'FICTIONAL_TEST 楼层' })
              .expect(201)
          ).body
          await http('post', `/community/posts/${visible.id}/comments`)
            .send({
              clientCommentId: `reply-${randomUUID()}`,
              parentCommentId: root.id,
              body: 'FICTIONAL_TEST 回复保留',
            })
            .expect(201)
          const path = `/community/posts/${visible.id}/comments/${root.id}`
          await http('delete', path, captain)
            .send({ expectedUpdatedAt: root.updatedAt })
            .expect(200)
          await http('delete', path, captain)
            .send({ expectedUpdatedAt: root.updatedAt })
            .expect(200)
          const read = (await http('get', `/public/posts/${visible.id}`).expect(200)).body
          assert.equal(read.commentCount, 1)
          assert.equal(read.comments[0].body, 'FICTIONAL_TEST 回复保留')
          assert.equal(
            await prisma!.auditLog.count({
              where: { targetId: root.id, action: 'COMMUNITY_COMMENT_DELETED' },
            }),
            1,
          )
        },
      )
      await t.test(
        'a primary team from the public directory can be tagged without tournament registration',
        async () => {
          const directoryTeam = await prisma!.team.create({
            data: {
              organizationId: org,
              teamCode: `FICTIONAL-${randomUUID().slice(0, 8)}`,
              name: 'FICTIONAL_TEST 未报名主队',
            },
          })
          await http('put', '/me/team-preferences')
            .send({ primaryTeamId: directoryTeam.id, followedTeamIds: [] })
            .expect(200)
          const suggestions = (
            await http(
              'get',
              '/public/post-tags?query=' + encodeURIComponent(directoryTeam.name),
            ).expect(200)
          ).body.items
          assert.ok(
            suggestions.some((tag: { targetId: string }) => tag.targetId === directoryTeam.id),
          )
          const tagged = (
            await http('post', '/community/posts')
              .send({
                ...payload,
                clientPostId: `directory-${randomUUID()}`,
                tags: [{ kind: 'TEAM', targetId: directoryTeam.id, label: '伪造队名' }],
              })
              .expect(201)
          ).body
          assert.equal(tagged.tags[0].label, directoryTeam.name)
          assert.equal(
            tagged.team,
            null,
            'Tagging a primary team does not grant team-author permissions',
          )
        },
      )
      if (process.env.FEED_BROWSER_CHECK === '1') {
        await t.test('desktop browser round trip against this isolated real API', async () => {
          // Keep fictional fixture avatars local; this test deliberately blocks external requests.
          await prisma!.user.updateMany({ data: { avatarUrl: null } })
          const browserPost = (
            await http('post', '/community/posts', captain)
              .send({
                ...payload,
                body: 'FICTIONAL_TEST 浏览器主帖',
                clientPostId: `browser-${randomUUID()}`,
              })
              .expect(201)
          ).body
          await http('post', `/community/posts/${browserPost.id}/comments`, captain)
            .send({
              body: 'FICTIONAL_TEST 别人的评论',
              clientCommentId: `browser-comment-${randomUUID()}`,
            })
            .expect(201)
          await app!.listen(0, '127.0.0.1')
          const address = server.address() as { port: number }
          const repository = resolve(__dirname, '../../../../..')
          const evidence = resolve(repository, 'private-data/feed-check')
          await mkdir(evidence, { recursive: true })
          await writeFile(
            resolve(evidence, 'browser-fixture.json'),
            JSON.stringify({
              session: student,
              postId: browserPost.id,
              api: `http://127.0.0.1:${address.port}`,
            }),
          )
          const python = process.env.FEED_TEST_PYTHON!
          assert.ok(python, 'Set FEED_TEST_PYTHON for browser validation')
          const child = spawn(
            python,
            [resolve(repository, 'scripts/verify-post-interactions-h5.py'), evidence],
            {
              cwd: repository,
              env: { ...process.env, PYTHONPATH: resolve(evidence, 'python') },
              windowsHide: true,
            },
          )
          let output = ''
          child.stdout.on('data', (chunk) => {
            output += chunk
          })
          child.stderr.on('data', (chunk) => {
            output += chunk
          })
          const code = await new Promise<number | null>((resolveExit, reject) => {
            child.on('error', reject)
            child.on('exit', resolveExit)
          })
          assert.equal(code, 0, output)
          console.log(output.trim())
        })
      }
    } finally {
      await app?.close()
      await prisma?.$disconnect()
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)
      await admin.$disconnect()
      if (previousDatabase === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previousDatabase
      if (previousTournament === undefined) delete process.env.DEFAULT_TOURNAMENT_ID
      else process.env.DEFAULT_TOURNAMENT_ID = previousTournament
    }
  },
)
