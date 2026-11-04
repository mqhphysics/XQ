import 'reflect-metadata'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import { HttpStatus } from '@nestjs/common'
import request from 'supertest'
import sharp from 'sharp'
import { configureApp } from '../app.setup'
import type { AuthService } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import type { PrismaService } from '../database/prisma.service'
import { MediaController } from '../media/media.controller'
import { MediaService } from '../media/media.service'
import type { SocialService } from '../social/social.service'
import { ExperienceController } from './experience.controller'
import { ExperienceService } from './experience.service'

test('HTTP publishes a large single photo, retries once, reads it back, and preserves text-only posts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xiaoqiu-post-images-'))
  const previous = process.env.POST_MEDIA_DIRECTORY
  process.env.POST_MEDIA_DIRECTORY = directory
  const org = '00000000-0000-4000-8000-000000000001'
  const userId = '00000000-0000-4000-8000-000000000002'
  const tournamentId = '00000000-0000-4000-8000-000000000003'
  const posts = new Map<string, Record<string, unknown>>()
  let auditCount = 0
  const tx = {
    post: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        const item = data[0]!
        const key = `${item.authorUserId}:${item.clientPostId}`
        if (posts.has(key)) return { count: 0 }
        posts.set(key, {
          ...item,
          id: `post-${posts.size + 1}`,
          publishedAt: new Date(),
          author: {
            id: userId,
            displayName: '照片验收账户',
            verificationLevel: 'STUDENT_VERIFIED',
            avatarUrl: null,
          },
          team: null,
          _count: { likes: 0, comments: 0 },
          likes: [],
        })
        return { count: 1 }
      },
      findUnique: async ({
        where,
      }: {
        where: { authorUserId_clientPostId: { authorUserId: string; clientPostId: string } }
      }) =>
        posts.get(
          `${where.authorUserId_clientPostId.authorUserId}:${where.authorUserId_clientPostId.clientPostId}`,
        ),
    },
    auditLog: {
      create: async () => {
        auditCount += 1
        return {}
      },
    },
  }
  const prisma = {
    postComment: { count: async () => 0 },
    $queryRaw: async () => [],
    $transaction: async (action: (transaction: typeof tx) => Promise<unknown>) => action(tx),
    tournament: { findFirst: async () => ({ id: tournamentId }) },
    post: {
      count: async ({ where }: { where: { imageUrl: string } }) =>
        [...posts.values()].filter((post) => post.imageUrl === where.imageUrl).length,
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        [...posts.values()].find((post) =>
          Object.entries(where).every(([key, value]) => {
            if (key !== 'OR') return post[key] === value
            return (
              Array.isArray(value) &&
              value.some(({ imageUrl }: { imageUrl: string | { endsWith: string } }) =>
                typeof imageUrl === 'string'
                  ? post.imageUrl === imageUrl
                  : typeof post.imageUrl === 'string' && post.imageUrl.endsWith(imageUrl.endsWith),
              )
            )
          }),
        ),
    },
  } as unknown as PrismaService
  const auth = {
    requireSession: async (authorization: string | undefined) => {
      if (authorization !== 'Bearer photo-test')
        throw new ApiHttpException(HttpStatus.UNAUTHORIZED, {
          code: 'AUTH.UNAUTHORIZED',
          message: '请先登录',
        })
      return { organizationId: org, userId, user: { roles: [] } }
    },
  } as unknown as AuthService
  const media = new MediaService(prisma, auth)
  const experience = new ExperienceService(prisma, auth, {} as SocialService, media)
  const module = await Test.createTestingModule({
    controllers: [ExperienceController, MediaController],
    providers: [
      { provide: ExperienceService, useValue: experience },
      { provide: MediaService, useValue: media },
    ],
  }).compile()
  const app = module.createNestApplication()
  configureApp(app)
  await app.init()
  try {
    const pixels = Buffer.alloc(512 * 320 * 3)
    let random = 123456789
    for (let i = 0; i < pixels.length; i += 1) {
      random ^= random << 13
      random ^= random >>> 17
      random ^= random << 5
      pixels[i] = random & 255
    }
    const bytes = await sharp(pixels, { raw: { width: 512, height: 320, channels: 3 } })
      .png()
      .toBuffer()
    const imageDataUrl = `data:image/png;base64,${bytes.toString('base64')}`
    assert.ok(
      imageDataUrl.length > 100 * 1024,
      'request must exercise the larger image body parser',
    )
    const payload = { clientPostId: 'post-photo-test-1', body: '带图发布验收', imageDataUrl }
    await request(app.getHttpServer()).post('/api/community/posts').send(payload).expect(401)
    assert.equal(posts.size, 0)
    const first = await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send(payload)
      .expect(201)
    assert.equal(first.body.title, null)
    assert.match(
      first.body.imageUrl,
      new RegExp(`^/api/media/posts/${org}/${userId}/[a-f0-9]{64}\\.webp$`),
    )
    const retry = await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send(payload)
      .expect(201)
    assert.equal(retry.body.id, first.body.id)
    assert.equal(auditCount, 1)
    const photo = await request(app.getHttpServer()).get(first.body.imageUrl).expect(200)
    assert.equal(photo.headers['content-type'], 'image/webp')
    assert.equal((await sharp(photo.body).metadata()).width, 512)
    await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send({ ...payload, imageDataUrl: undefined })
      .expect(409)
    const plain = await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send({ clientPostId: 'post-text-test-2', body: '纯文字发布验收' })
      .expect(201)
    assert.equal(plain.body.imageUrl, null)
    assert.equal(auditCount, 2)
    const animationPixels = Buffer.alloc(96 * 192 * 3)
    animationPixels.fill(255, 0, 96 * 96 * 3)
    const gif = await sharp(animationPixels, {
      raw: { width: 96, height: 192, channels: 3, pageHeight: 96 },
    })
      .gif({ delay: [80, 120], loop: 0 })
      .toBuffer()
    const gifDataUrl = `data:image/gif;base64,${gif.toString('base64')}`
    const albumPayload = {
      clientPostId: 'post-album-test-3',
      body: '',
      imageDataUrls: [imageDataUrl, gifDataUrl, imageDataUrl],
    }
    const album = await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send(albumPayload)
      .expect(201)
    assert.equal(album.body.imageUrls.length, 3)
    assert.equal(album.body.imageUrl, album.body.imageUrls[0])
    const animation = await request(app.getHttpServer()).get(album.body.imageUrls[1]).expect(200)
    const animationMetadata = await sharp(animation.body, { animated: true }).metadata()
    assert.equal(animationMetadata.pages, 2, 'GIF frames must survive storage')
    assert.deepEqual(animationMetadata.delay, [80, 120])
    assert.equal(animationMetadata.loop, 0)
    const albumRetry = await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send(albumPayload)
      .expect(201)
    assert.equal(albumRetry.body.id, album.body.id)
    assert.equal(auditCount, 3)
    await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send({ ...albumPayload, imageDataUrls: [gifDataUrl, imageDataUrl, imageDataUrl] })
      .expect(409)
    await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send({
        ...albumPayload,
        clientPostId: 'post-album-test-4',
        imageDataUrls: Array(10).fill(imageDataUrl),
      })
      .expect(400)
    await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send({ ...albumPayload, clientPostId: 'post-album-test-5', imageDataUrl })
      .expect(409)
    await request(app.getHttpServer())
      .post('/api/community/posts')
      .set('Authorization', 'Bearer photo-test')
      .send({ clientPostId: 'post-empty-test-6', body: '' })
      .expect(400)
    posts.get(`${userId}:${albumPayload.clientPostId}`)!.status = 'HIDDEN'
    for (const image of album.body.imageUrls)
      await request(app.getHttpServer()).get(image).expect(404)
    await request(app.getHttpServer())
      .get(album.body.imageUrls[1].replace(org, tournamentId))
      .expect(404)
    await request(app.getHttpServer())
      .get(album.body.imageUrls[1].replace('-3-1.webp', '-3-8.webp'))
      .expect(404)
    posts.get(`${userId}:${payload.clientPostId}`)!.status = 'HIDDEN'
    await request(app.getHttpServer()).get(first.body.imageUrl).expect(404)
    await request(app.getHttpServer())
      .get(first.body.imageUrl.replace(userId, tournamentId))
      .expect(404)
  } finally {
    await app.close()
    if (previous === undefined) delete process.env.POST_MEDIA_DIRECTORY
    else process.env.POST_MEDIA_DIRECTORY = previous
    await rm(directory, { recursive: true, force: true })
  }
})
