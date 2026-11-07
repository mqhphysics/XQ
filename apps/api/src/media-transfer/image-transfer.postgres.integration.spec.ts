import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import sharp from 'sharp'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaService } from '../database/prisma.service'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { hashPassword } from '../auth/password'

test(
  'large images and GIFs use real authenticated chunks, keep moderation and do not alter check-ins',
  { timeout: 90000 },
  async () => {
    const url = process.env.TEST_DATABASE_URL
    assert(url, 'An isolated TEST_DATABASE_URL is required')
    assert.match(new URL(url).pathname, /_test_/)
    if (process.env.DATABASE_URL)
      assert.notEqual(new URL(url).pathname, new URL(process.env.DATABASE_URL).pathname)
    const work = process.platform === 'win32' ? 'D:/MuDevSpace/XQ-work' : tmpdir()
    const folder = await mkdtemp(join(work, 'xq-chunk-http-test-'))
    const previousTransfer = process.env.IMAGE_TRANSFER_DIRECTORY,
      previousMedia = process.env.POST_MEDIA_DIRECTORY
    process.env.IMAGE_TRANSFER_DIRECTORY = join(folder, 'image-transfers')
    process.env.POST_MEDIA_DIRECTORY = join(folder, 'posts')
    const db = new PrismaClient({ datasources: { db: { url } } })
    const suffix = randomUUID(),
      password = 'FICTIONAL-Image-090!',
      credential = hashPassword(password)
    const org = await db.organization.create({
      data: { slug: 'chunk-' + suffix, name: 'FICTIONAL_TEST image owner' },
    })
    const foreign = await db.organization.create({
      data: { slug: 'chunk-foreign-' + suffix, name: 'FICTIONAL_TEST other organization' },
    })
    const season = await db.season.create({
      data: { organizationId: org.id, seasonCode: suffix, name: 'FICTIONAL_TEST season' },
    })
    const tournament = await db.tournament.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        tournamentCode: suffix,
        name: 'FICTIONAL_TEST tournament',
        status: 'PUBLISHED',
      },
    })
    const match = await db.match.create({
      data: {
        organizationId: org.id,
        tournamentId: tournament.id,
        matchCode: suffix,
        title: 'FICTIONAL_TEST match',
        status: 'FINISHED',
      },
    })
    const users = await Promise.all(
      [org, org, foreign].map((item, index) =>
        db.user.create({
          data: {
            loginNameNormalized: `chunk-${suffix}-${index}`,
            displayName: `FICTIONAL_TEST ${index}`,
            memberships: { create: { organizationId: item.id, status: 'ACTIVE' } },
            passwordCredential: {
              create: {
                passwordHash: credential.hash,
                passwordSalt: credential.salt,
                algorithm: credential.algorithm,
              },
            },
          },
        }),
      ),
    )
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
        users.map(
          async (user, index) =>
            'Bearer ' +
            (
              await http
                .post('/api/auth/login')
                .set('x-organization-id', index === 2 ? foreign.id : org.id)
                .send({ username: user.loginNameNormalized, password })
                .expect(200)
            ).body.accessToken,
        ),
      )
      const png = await sharp(randomBytes(700 * 700 * 3), {
        raw: { width: 700, height: 700, channels: 3 },
      })
        .png({ compressionLevel: 0 })
        .toBuffer()
      const source = 'data:image/png;base64,' + png.toString('base64')
      assert(Buffer.byteLength(JSON.stringify({ imageDataUrls: [source] })) > 1024 * 1024)
      assert(png.length < 4 * 1024 * 1024)
      const upload = async (content: string, auth = tokens[0]!, chosenId = randomUUID()) => {
        const endpoint = '/api/me/image-transfers/' + chosenId
        const start = await http
          .put(endpoint)
          .set('authorization', auth)
          .send({ characters: content.length })
          .expect(200)
        assert.equal(start.body.partCharacters, 524288)
        for (let index = 0; index < start.body.parts; index++) {
          const body = {
            content: content.slice(
              index * start.body.partCharacters,
              (index + 1) * start.body.partCharacters,
            ),
          }
          assert(Buffer.byteLength(JSON.stringify(body)) < 1024 * 1024)
          await http
            .put(endpoint + '/parts/' + index)
            .set('authorization', auth)
            .send(body)
            .expect(200)
        }
        return chosenId
      }
      const uploadId = randomUUID(),
        endpoint = '/api/me/image-transfers/' + uploadId
      await http.put(endpoint).send({ characters: source.length }).expect(401)
      await http
        .put(endpoint)
        .set('authorization', tokens[0]!)
        .send({ characters: source.length })
        .expect(200)
      const first = source.slice(0, 524288)
      await http
        .put(endpoint + '/parts/0')
        .set('authorization', tokens[0]!)
        .send({ content: first })
        .expect(200)
      await http
        .put(endpoint + '/parts/0')
        .set('authorization', tokens[0]!)
        .send({ content: first })
        .expect(200)
      await http
        .put(endpoint + '/parts/0')
        .set('authorization', tokens[0]!)
        .send({ content: 'X' + first.slice(1) })
        .expect(409)
      for (const auth of [tokens[1]!, tokens[2]!])
        await http
          .put(endpoint + '/parts/0')
          .set('authorization', auth)
          .send({ content: first })
          .expect(404)
      const postInput = {
        body: 'FICTIONAL_TEST large image',
        clientPostId: randomUUID(),
        tournamentId: tournament.id,
        imageUploadIds: [uploadId],
      }
      const sendPost = (auth = tokens[0]!, body = postInput) =>
        http.post('/api/community/posts').set('authorization', auth).send(body)
      await sendPost().expect(409)
      await sendPost(tokens[1]!).expect(404)
      await upload(source, tokens[0]!, uploadId)
      const posted = await sendPost().expect(201)
      assert.equal((await sendPost().expect(201)).body.id, posted.body.id)
      assert.equal(posted.body.publicationState, 'PUBLISHED')
      const saved = await db.post.findUniqueOrThrow({ where: { id: posted.body.id } })
      assert(saved.imageUrl)
      const visible = await http.get(saved.imageUrl).expect(200)
      assert.equal((await sharp(visible.body).metadata()).width, 700)
      const manifest = JSON.parse(
        await readFile(
          join(folder, 'image-transfers', org.id, users[0]!.id, uploadId, 'manifest.json'),
          'utf8',
        ),
      )
      assert(manifest.completedAt)
      await http
        .put('/api/matches/' + match.id + '/check-in')
        .set('authorization', tokens[0]!)
        .expect(200)
      const commentUpload = await upload(source, tokens[1]!)
      const commentInput = {
        body: 'FICTIONAL_TEST image comment',
        clientCommentId: randomUUID(),
        imageUploadIds: [commentUpload],
      }
      const sendComment = () =>
        http
          .post('/api/community/posts/' + posted.body.id + '/comments')
          .set('authorization', tokens[1]!)
          .send(commentInput)
      const comment = await sendComment().expect(201)
      assert.equal((await sendComment().expect(201)).body.id, comment.body.id)
      assert.equal(await db.matchCheckin.count({ where: { matchId: match.id } }), 1)
      const pixels = Buffer.alloc(96 * 192 * 3)
      pixels.fill(255, 0, 96 * 96 * 3)
      const gif = await sharp(pixels, {
        raw: { width: 96, height: 192, channels: 3, pageHeight: 96 },
      })
        .gif({ delay: [80, 120], loop: 0 })
        .toBuffer()
      const gifId = await upload('data:image/gif;base64,' + gif.toString('base64'))
      const animation = await http
        .post('/api/community/posts')
        .set('authorization', tokens[0]!)
        .send({
          body: 'FICTIONAL_TEST animated GIF',
          clientPostId: randomUUID(),
          tournamentId: tournament.id,
          imageUploadIds: [gifId],
        })
        .expect(201)
      const gifPost = await db.post.findUniqueOrThrow({ where: { id: animation.body.id } })
      const rendered = await http.get(gifPost.imageUrl!).expect(200)
      const animationInfo = await sharp(rendered.body, { animated: true }).metadata()
      assert.equal(animationInfo.pages, 2)
      assert.deepEqual(animationInfo.delay, [80, 120])
      assert.equal(animationInfo.loop, 0)
      const fakeId = await upload(
        'data:image/png;base64,' + Buffer.alloc(200, 9).toString('base64'),
      )
      await http
        .post('/api/community/posts')
        .set('authorization', tokens[0]!)
        .send({
          body: 'invalid content',
          clientPostId: randomUUID(),
          tournamentId: tournament.id,
          imageUploadIds: [fakeId],
        })
        .expect(400)
      const mixed = await http
        .post('/api/community/posts')
        .set('authorization', tokens[0]!)
        .send({ ...postInput, clientPostId: randomUUID(), imageDataUrls: [source] })
      assert.equal(mixed.status, 409)
      await db.aiModerationSetting.create({
        data: {
          organizationId: org.id,
          enabled: true,
          policies: {
            POST: { enabled: true, publication: 'AI_FIRST' },
            COMMENT: { enabled: true, publication: 'AI_FIRST' },
          },
        },
      })
      const pending = await http
        .post('/api/community/posts')
        .set('authorization', tokens[0]!)
        .send({
          ...postInput,
          clientPostId: randomUUID(),
          body: 'FICTIONAL_TEST pending moderation',
        })
        .expect(201)
      assert.equal(pending.body.publicationState, 'PENDING_REVIEW')
      assert.equal(
        (await db.post.findUniqueOrThrow({ where: { id: pending.body.id } })).status,
        'DRAFT',
      )
      await http
        .get('/api/public/posts/' + pending.body.id)
        .set('x-organization-id', org.id)
        .expect(404)
      const pendingComment = await http
        .post('/api/community/posts/' + posted.body.id + '/comments')
        .set('authorization', tokens[1]!)
        .send({
          ...commentInput,
          clientCommentId: randomUUID(),
          body: 'FICTIONAL_TEST pending comment',
        })
        .expect(201)
      assert(
        (await db.postComment.findUniqueOrThrow({ where: { id: pendingComment.body.id } }))
          .hiddenAt,
      )
      assert.equal(await db.matchCheckin.count({ where: { matchId: match.id } }), 1)
    } finally {
      await app.close()
      await db.$disconnect()
      if (previousTransfer === undefined) delete process.env.IMAGE_TRANSFER_DIRECTORY
      else process.env.IMAGE_TRANSFER_DIRECTORY = previousTransfer
      if (previousMedia === undefined) delete process.env.POST_MEDIA_DIRECTORY
      else process.env.POST_MEDIA_DIRECTORY = previousMedia
      assert.equal(dirname(resolve(folder)), resolve(work))
      await rm(folder, { recursive: true, force: true })
    }
  },
)
