import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { CreateCommentDto } from './experience.dto'
import { MediaService, commentImageUrls } from '../media/media.service'
import { resizeMedia } from '../media/media-variant'
import { ExperienceService } from './experience.service'
import type { PrismaService } from '../database/prisma.service'
import type { AuthService } from '../auth/auth.service'
import type { SocialService } from '../social/social.service'
import type { AiModerationService } from '../ai-moderation/ai-moderation.service'
import type { Prisma } from '../generated/prisma/client'

const org = '00000000-0000-4000-8000-000000000001'
const user = '00000000-0000-4000-8000-000000000002'
const commentId = '00000000-0000-4000-8000-000000000003'
type CommentFixture = Prisma.PostCommentCreateManyInput & {
  id: string
  createdAt: Date
  updatedAt: Date
  user: { id: string; displayName: string; avatarUrl: null; verificationLevel: string }
  _count: { likes: number }
  likes: Array<{ id: string }>
}
type RepostFixture = Prisma.PostCreateManyInput & {
  id: string
  publishedAt: Date
  updatedAt: Date
  author: null
  team: null
  tags: []
  _count: { likes: number; comments: number }
  likes: []
}

test('retrying a comment cannot requeue or republish a subsequently hidden repost', async () => {
  const date = new Date('2026-01-01'),
    source = { id: commentId, authorUserId: user, tournamentId: null }
  let comment: CommentFixture | null = null,
    repost: RepostFixture | null = null,
    notices = 0
  const queued: string[] = []
  const tx = {
    userBlock: { findMany: async () => [], findFirst: async () => null },
    $executeRaw: async () => 0,
    postComment: {
      createMany: async ({ data }: { data: [Prisma.PostCommentCreateManyInput] }) => {
        if (comment) return { count: 0 }
        comment = {
          ...data[0],
          id: commentId,
          createdAt: date,
          updatedAt: date,
          user: { id: user, displayName: 'fixture', avatarUrl: null, verificationLevel: 'NONE' },
          _count: { likes: 0 },
          likes: [],
        }
        return { count: 1 }
      },
      findUnique: async () => comment,
    },
    post: {
      findFirst: async () => source,
      findUnique: async () => repost,
      create: async ({ data }: { data: Prisma.PostCreateManyInput }) =>
        (repost = {
          ...data,
          id: 'fixture-post',
          publishedAt: date,
          updatedAt: date,
          author: null,
          team: null,
          tags: [],
          _count: { likes: 0, comments: 0 },
          likes: [],
        }),
    },
    auditLog: { create: async () => ({}) },
  }
  const db = {
    ...tx,
    $transaction: async (action: (transaction: typeof tx) => Promise<unknown>) => action(tx),
  } as unknown as PrismaService
  const service = new ExperienceService(
    db,
    {
      requireSession: async () => ({ userId: user, organizationId: org, user: { roles: [] } }),
    } as unknown as AuthService,
    {
      notify: async () => {
        notices++
      },
    } as unknown as SocialService,
    { storePostImages: async () => null } as unknown as MediaService,
    undefined,
    {
      requiresPreReview: async () => false,
      enqueue: async (_tx: unknown, _org: string, type: string) => {
        queued.push(type)
      },
    } as unknown as AiModerationService,
  )
  const input = { clientCommentId: 'comment-retry-fixture', body: 'fixture', repostToFeed: true }
  await service.createComment('token', commentId, input)
  assert.deepEqual(queued, ['COMMENT', 'POST'])
  ;(repost as unknown as RepostFixture).status = 'HIDDEN'
  const retry = await service.createComment('token', commentId, input)
  assert.equal(retry.repostedPost, null)
  assert.equal((repost as unknown as RepostFixture).status, 'HIDDEN')
  assert.equal(notices, 1)
  assert.deepEqual(queued, ['COMMENT', 'POST'])
})

test('comment DTO accepts image-only/reply payloads and retains text/count limits', async () => {
  const payload = {
    clientCommentId: 'comment-media-1',
    body: '',
    parentCommentId: commentId,
    imageDataUrls: ['data:image/gif;base64,R0lG'],
  }
  assert.deepEqual(await validate(plainToInstance(CreateCommentDto, payload)), [])
  for (const changed of [
    { body: 'a'.repeat(301) },
    { imageDataUrls: Array(4).fill('data:image/png;base64,eA==') },
    { imageDataUrls: [1] },
  ])
    assert.ok(
      (await validate(plainToInstance(CreateCommentDto, { ...payload, ...changed }))).length,
    )
})

test('comment media keeps animation through storage and thumbnail reads, reuses files and gates hidden sources', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xiaoqiu-comment-media-'))
  const previous = process.env.POST_MEDIA_DIRECTORY
  process.env.POST_MEDIA_DIRECTORY = directory
  let hidden = false,
    published = true,
    policyBlocked = false
  let imageUrl = ''
  const db = {
    $queryRaw: async () => (policyBlocked ? [{ state: { blocked: true } }] : []),
    postComment: {
      findFirst: async () =>
        hidden || !published
          ? null
          : { organizationId: org, userId: user, imageUrl, post: { organizationId: org } },
      count: async () => 1,
    },
    post: { count: async () => 0 },
  } as unknown as PrismaService
  const media = new MediaService(db, {} as AuthService)
  try {
    const pixels = Buffer.alloc(96 * 192 * 3)
    pixels.fill(255, 0, 96 * 96 * 3)
    const gif = await sharp(pixels, {
      raw: { width: 96, height: 192, channels: 3, pageHeight: 96 },
    })
      .gif({ delay: [80, 120], loop: 0 })
      .toBuffer()
    const input = `data:image/gif;base64,${gif.toString('base64')}`
    imageUrl = (await media.storePostImages(org, user, [input, input]))!.imageUrl
    const before = await readdir(join(directory, org, user))
    assert.equal((await media.storePostImages(org, user, [input, input]))!.imageUrl, imageUrl)
    assert.deepEqual(await readdir(join(directory, org, user)), before)
    const url = commentImageUrls(commentId, imageUrl)[1]!
    const file = url.split('/').at(-1)!
    const original = await media.readCommentImage(commentId, file)
    for (const width of [undefined, 64]) {
      const variant = await resizeMedia(original.body, original.mimeType, width)
      const metadata = await sharp(variant.body, { animated: true }).metadata()
      assert.equal(metadata.pages, 2)
      assert.deepEqual(metadata.delay, [80, 120])
      assert.equal(metadata.loop, 0)
    }
    await media.cleanupPostImageIfUnreferenced(imageUrl)
    assert.deepEqual(
      await readdir(join(directory, org, user)),
      before,
      'comment references retain files',
    )
    hidden = true
    await assert.rejects(media.readCommentImage(commentId, file))
    hidden = false
    published = false
    await assert.rejects(media.readCommentImage(commentId, file))
    published = true
    policyBlocked = true
    await assert.rejects(media.readCommentImage(commentId, file))
    await assert.rejects(media.readCommentImage(commentId, '../bad.webp'))
    await assert.rejects(
      media.storePostImages(org, user, [
        `data:image/gif;base64,${Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64')}`,
      ]),
    )
  } finally {
    if (previous === undefined) delete process.env.POST_MEDIA_DIRECTORY
    else process.env.POST_MEDIA_DIRECTORY = previous
    await rm(directory, { recursive: true, force: true })
  }
})

test('favorite list requires a session and queries only its user, organization and published posts in favorite order', async () => {
  let query: unknown
  const service = new ExperienceService(
    {
      userBlock: { findMany: async () => [] },
      postFavorite: {
        count: async () => 0,
        findMany: async (input: unknown) => {
          query = input
          return []
        },
      },
    } as unknown as PrismaService,
    {
      requireSession: async (auth: string) => {
        assert.equal(auth, 'Bearer current')
        return { userId: user, organizationId: org }
      },
    } as unknown as AuthService,
    {} as SocialService,
    {} as MediaService,
  )
  assert.deepEqual(await service.listFavoritePosts('Bearer current'), {
    items: [],
    totalCount: 0,
    nextCursor: null,
  })
  const input = query as { where: unknown; orderBy: unknown }
  assert.deepEqual(input.where, {
    organizationId: org,
    userId: user,
    post: { organizationId: org, status: 'PUBLISHED' },
  })
  assert.deepEqual(input.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }])
})
