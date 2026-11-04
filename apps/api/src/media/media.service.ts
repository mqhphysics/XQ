import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import sharp from 'sharp'

import { AuthService } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import { AuditActorType } from '../generated/prisma/client'
import { assertMediaReadable } from './media-access-policy'
import { readDefaultMedia, defaultAvatar } from './default-media'
import { ManagedMediaService } from '../managed-media/managed-media.service'
import { AiModerationService } from '../ai-moderation/ai-moderation.service'
import { syncLinkedPlayerAvatar } from './linked-player-avatar'
import type { Prisma } from '../generated/prisma/client'
import type { MediaPurpose } from '../managed-media/managed-media.dto'

const MAX_AVATAR_BYTES = 72 * 1024
const MIN_AVATAR_EDGE = 64
const avatarDirectory = () =>
  process.env.AVATAR_MEDIA_DIRECTORY || resolve(__dirname, '../../../../private-data/media/avatars')
const DEMO_DIRECTORY = resolve(__dirname, '../../demo-media')
const MAX_POST_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_POST_OUTPUT_BYTES = 768 * 1024

function postDirectory(): string {
  return (
    process.env.POST_MEDIA_DIRECTORY || resolve(__dirname, '../../../../private-data/media/posts')
  )
}

export interface StoredPostImage {
  imageUrl: string
  bytes: number
  width: number
  height: number
}

// The existing imageUrl remains a renderable cover. Album membership is encoded in
// content-addressed filenames, keeping the local media adapter schema-compatible.
export function postImageUrls(imageUrl: string | null): string[] {
  if (!imageUrl) return []
  const demoAlbum = /^\/api\/media\/demo\/album:((?:0[2-9]|[1-9]\d)(?:,(?:0[2-9]|[1-9]\d))*)$/.exec(
    imageUrl,
  )
  if (demoAlbum?.[1]) {
    return demoAlbum[1].split(',').map((id) => `/api/media/demo/photos/${id}.webp`)
  }
  const album =
    /^((?:https?:\/\/[^/]+)?\/api\/media\/posts\/[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9]{64})-([2-9])-0\.webp$/.exec(
      imageUrl,
    )
  return album
    ? Array.from(
        { length: Number(album[2]) },
        (_, index) => `${album[1]}-${album[2]}-${index}.webp`,
      )
    : [imageUrl]
}

// Each comment has its own visibility gate, even when content-addressed files are shared.
export function commentImageUrls(commentId: string, imageUrl: string | null): string[] {
  return postImageUrls(imageUrl).map(
    (url) => `/api/media/comments/${commentId}/${url.split('/').at(-1)!}`,
  )
}

export interface StoredAvatar {
  avatarUrl: string
  bytes: number
  height: number
  mimeType: string
  width: number
}

type AvatarSubtype = 'jpeg' | 'png' | 'webp'

@Injectable()
export class MediaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Optional() @Inject(AiModerationService) private readonly aiModeration?: AiModerationService,
    @Optional() @Inject(ManagedMediaService) private readonly managedMedia?: ManagedMediaService,
  ) {}

  async submitManagedProfile(
    tx: Prisma.TransactionClient,
    session: Awaited<ReturnType<AuthService['requireSession']>>,
    purpose: MediaPurpose,
    targetId: string,
    dataUrl: string,
    requestId: string,
  ) {
    if (!this.managedMedia) throw new Error('资料媒体服务不可用')
    return this.managedMedia.submitProfile(tx, session, purpose, targetId, dataUrl, requestId)
  }
  async abortManagedProfile(organizationId: string, id: string) {
    await this.managedMedia?.abortProfile(organizationId, id)
  }

  async readDefault(fileName: string) {
    const picture = await readDefaultMedia(fileName)
    if (!picture) throw notFound('默认图片不存在')
    return picture
  }

  async storePostImage(
    organizationId: string,
    authorUserId: string,
    dataUrl: string,
  ): Promise<StoredPostImage> {
    if (!isMediaScope(organizationId) || !isMediaScope(authorUserId))
      throw badAvatar('图片所属账户无效')
    const image = await normalizePostImage(dataUrl)
    const fileName = `${createHash('sha256').update(image.body).digest('hex')}.webp`
    const directory = resolve(postDirectory(), organizationId, authorUserId)
    await mkdir(directory, { recursive: true })
    try {
      await writeFile(resolve(directory, fileName), image.body, { flag: 'wx' })
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
    }
    return {
      imageUrl: `/api/media/posts/${organizationId}/${authorUserId}/${fileName}`,
      bytes: image.body.length,
      width: image.width,
      height: image.height,
    }
  }

  async readPostImage(
    organizationId: string,
    authorUserId: string,
    fileName: string,
  ): Promise<{ body: Buffer; mimeType: string }> {
    if (
      !isMediaScope(organizationId) ||
      !isMediaScope(authorUserId) ||
      !/^[a-f0-9]{64}(?:-[2-9]-[0-8])?\.webp$/.test(fileName)
    )
      throw notFound('动态图片不存在')
    const album = /^([a-f0-9]{64})-([2-9])-([0-8])\.webp$/.exec(fileName)
    if (album && Number(album[3]) >= Number(album[2])) throw notFound('动态图片不存在')
    const cover = album ? `${album[1]}-${album[2]}-0.webp` : fileName
    const imageUrl = `/api/media/posts/${organizationId}/${authorUserId}/${cover}`
    if (
      !(await assertMediaReadable(
        this.prisma,
        `/api/media/posts/${organizationId}/${authorUserId}/${fileName}`,
      ))
    )
      throw notFound('动态图片已下架')
    const visiblePost = await this.prisma.post.findFirst({
      where: {
        organizationId,
        authorUserId,
        OR: [{ imageUrl }, { imageUrl: { endsWith: imageUrl } }],
        status: 'PUBLISHED',
      },
      select: { id: true },
    })
    if (!visiblePost) throw notFound('动态图片不存在')
    try {
      return {
        body: await readFile(resolve(postDirectory(), organizationId, authorUserId, fileName)),
        mimeType: 'image/webp',
      }
    } catch {
      throw notFound('动态图片不存在')
    }
  }

  async cleanupPostImageIfUnreferenced(imageUrl: string): Promise<void> {
    const match =
      /^\/api\/media\/posts\/([a-f0-9-]+)\/([a-f0-9-]+)\/([a-f0-9]{64}(?:-[2-9]-0)?\.webp)$/.exec(
        imageUrl,
      )
    if (!match || !isMediaScope(match[1]!) || !isMediaScope(match[2]!)) return
    if (await this.prisma.post.count({ where: { imageUrl } })) return
    if (await this.prisma.postComment.count({ where: { imageUrl } })) return
    for (const url of postImageUrls(imageUrl)) {
      try {
        await unlink(resolve(postDirectory(), match[1]!, match[2]!, url.split('/').at(-1)!))
      } catch {
        // Missing or concurrently cleaned files need no further action.
      }
    }
  }

  async readCommentImage(
    commentId: string,
    fileName: string,
  ): Promise<{ body: Buffer; mimeType: string }> {
    if (!isMediaScope(commentId) || !/^[a-f0-9]{64}(?:-[2-3]-[0-2])?\.webp$/.test(fileName))
      throw notFound('评论图片不存在')
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, hiddenAt: null, post: { status: 'PUBLISHED' } },
      select: {
        organizationId: true,
        userId: true,
        imageUrl: true,
        post: { select: { organizationId: true } },
      },
    })
    if (!comment || comment.organizationId !== comment.post.organizationId || !comment.imageUrl)
      throw notFound('评论图片不存在')
    const canonical = postImageUrls(comment.imageUrl).find(
      (url) => url.split('/').at(-1) === fileName,
    )
    if (
      !canonical ||
      canonical !== `/api/media/posts/${comment.organizationId}/${comment.userId}/${fileName}` ||
      !(await assertMediaReadable(this.prisma, canonical))
    )
      throw notFound('评论图片不存在')
    try {
      return {
        body: await readFile(
          resolve(postDirectory(), comment.organizationId, comment.userId, fileName),
        ),
        mimeType: 'image/webp',
      }
    } catch {
      throw notFound('评论图片不存在')
    }
  }

  async storePostImages(
    organizationId: string,
    authorUserId: string,
    dataUrls: string[],
  ): Promise<StoredPostImage | null> {
    if (!isMediaScope(organizationId) || !isMediaScope(authorUserId))
      throw badAvatar('图片所属账户无效')
    if (dataUrls.length > 9) throw badAvatar('每条动态最多 9 张图片')
    if (dataUrls.reduce((sum, url) => sum + url.length, 0) > 24_000_000)
      throw badAvatar('图片总大小过大，请减少图片')
    if (dataUrls.length === 0) return null
    if (dataUrls.length === 1)
      return this.storePostImage(organizationId, authorUserId, dataUrls[0]!)
    // Normalize all files before writing, so a rejected image leaves no partial album.
    const images = []
    for (const dataUrl of dataUrls) images.push(await normalizePostImage(dataUrl))
    const hash = createHash('sha256')
    for (const image of images) hash.update(createHash('sha256').update(image.body).digest())
    const prefix = `${hash.digest('hex')}-${images.length}`
    const directory = resolve(postDirectory(), organizationId, authorUserId)
    await mkdir(directory, { recursive: true })
    const imageUrl = `/api/media/posts/${organizationId}/${authorUserId}/${prefix}-0.webp`
    try {
      for (const [index, image] of images.entries()) {
        try {
          await writeFile(resolve(directory, `${prefix}-${index}.webp`), image.body, { flag: 'wx' })
        } catch (error) {
          if (!isAlreadyExists(error)) throw error
        }
      }
    } catch (error) {
      await this.cleanupPostImageIfUnreferenced(imageUrl)
      throw error
    }
    return {
      imageUrl,
      bytes: images.reduce((sum, image) => sum + image.body.length, 0),
      width: images[0]!.width,
      height: images[0]!.height,
    }
  }

  async updateMyAvatar(authorization: string | undefined, dataUrl: string, requestId: string) {
    const session = await this.authService.requireSession(authorization)
    if (
      this.managedMedia &&
      (await this.aiModeration?.requiresPreReview(
        this.prisma,
        session.organizationId,
        'USER_AVATAR',
      ))
    ) {
      const saved = await this.managedMedia.submit(
        authorization,
        {
          purpose: 'USER_AVATAR',
          targetId: session.userId,
          dataUrl,
          clientSubmissionId: requestId.length >= 8 ? requestId : randomUUID(),
        },
        requestId,
      )
      return {
        avatar: {
          ...saved,
          avatarUrl: defaultAvatar('user', session.userId, session.user.avatarUrl),
        },
        user: session.user,
        publicationState: 'PENDING_REVIEW',
      }
    }
    const stored = await this.storeAvatar(dataUrl)
    const previousUrl = session.user.avatarUrl
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: session.userId },
          data: { avatarUrl: stored.avatarUrl },
        })
        if (session.user.linkedPlayer)
          await syncLinkedPlayerAvatar(
            tx,
            session.organizationId,
            session.userId,
            previousUrl,
            stored.avatarUrl,
          )
        await tx.auditLog.create({
          data: {
            organizationId: session.organizationId,
            actorType: AuditActorType.USER,
            actorUserId: session.userId,
            actorRoleSnapshot: session.user.roles.map(({ role, scopeType, scopeId }) => ({
              role,
              scopeType,
              scopeId,
            })),
            action: 'USER_AVATAR_UPDATED',
            targetType: 'User',
            targetId: session.userId,
            beforeSummary: { avatarUrl: previousUrl },
            afterSummary: {
              ...stored,
            },
            reason: '用户裁剪并上传账户头像',
            requestId,
            source: 'API',
          },
        })
        await this.aiModeration?.enqueue(tx, session.organizationId, 'USER_AVATAR', session.userId)
      })
    } catch (error) {
      await this.cleanupAvatarIfUnreferenced(stored.avatarUrl)
      throw error
    }
    if (previousUrl && previousUrl !== stored.avatarUrl)
      await this.cleanupAvatarIfUnreferenced(previousUrl)
    return {
      avatar: stored,
      user: (await this.authService.requireSession(authorization)).user,
    }
  }

  async updatePlayerAvatar(
    authorization: string | undefined,
    playerId: string,
    dataUrl: string,
    requestId: string,
  ) {
    const session = await this.authService.requireSession(authorization)
    const canAdminister = session.user.roles.some(
      (assignment) =>
        assignment.role === 'PLATFORM_ADMIN' ||
        (assignment.role === 'ORGANIZATION_ADMIN' &&
          assignment.scopeType === 'ORGANIZATION' &&
          assignment.scopeId === session.organizationId),
    )
    if (session.user.linkedPlayer?.id !== playerId && !canAdminister) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '只能修改本人已关联的球员头像',
      })
    }
    const player = await this.prisma.playerProfile.findFirst({
      where: { id: playerId, organizationId: session.organizationId },
      select: { id: true, avatarUrl: true },
    })
    if (!player) throw notFound('球员不存在')

    if (
      this.managedMedia &&
      (await this.aiModeration?.requiresPreReview(
        this.prisma,
        session.organizationId,
        'PLAYER_AVATAR',
      ))
    ) {
      const saved = await this.managedMedia.submit(
        authorization,
        {
          purpose: 'PLAYER_AVATAR',
          targetId: playerId,
          dataUrl,
          clientSubmissionId: requestId.length >= 8 ? requestId : randomUUID(),
        },
        requestId,
      )
      return {
        avatar: { ...saved, avatarUrl: defaultAvatar('player', playerId, player.avatarUrl) },
        publicationState: 'PENDING_REVIEW',
      }
    }

    const stored = await this.storeAvatar(dataUrl)
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.playerProfile.update({
          where: { id: playerId },
          data: { avatarUrl: stored.avatarUrl },
        })
        await tx.auditLog.create({
          data: {
            organizationId: session.organizationId,
            actorType: canAdminister ? AuditActorType.ADMIN : AuditActorType.USER,
            actorUserId: session.userId,
            actorRoleSnapshot: session.user.roles.map(({ role, scopeType, scopeId }) => ({
              role,
              scopeType,
              scopeId,
            })),
            action: 'PLAYER_AVATAR_UPDATED',
            targetType: 'PlayerProfile',
            targetId: playerId,
            beforeSummary: { avatarUrl: player.avatarUrl },
            afterSummary: { ...stored },
            reason: canAdminister ? '管理员更新球员头像' : '球员更新本人头像',
            requestId,
            source: 'API',
          },
        })
        await this.aiModeration?.enqueue(tx, session.organizationId, 'PLAYER_AVATAR', playerId)
      })
    } catch (error) {
      await this.cleanupAvatarIfUnreferenced(stored.avatarUrl)
      throw error
    }
    if (player.avatarUrl && player.avatarUrl !== stored.avatarUrl) {
      await this.cleanupAvatarIfUnreferenced(player.avatarUrl)
    }
    return { avatar: stored }
  }

  async readAvatar(fileName: string): Promise<{ body: Buffer; mimeType: string }> {
    if (!/^[a-f0-9]{64}\.(?:webp|png|jpg)$/.test(fileName)) throw notFound('头像不存在')
    if (!(await assertMediaReadable(this.prisma, `/api/media/avatars/${fileName}`)))
      throw notFound('头像已下架')
    try {
      const body = await readFile(resolve(avatarDirectory(), fileName))
      const extension = fileName.slice(fileName.lastIndexOf('.') + 1)
      return {
        body,
        mimeType:
          extension === 'webp' ? 'image/webp' : extension === 'png' ? 'image/png' : 'image/jpeg',
      }
    } catch {
      throw notFound('头像不存在')
    }
  }

  async readDemoMedia(kind: string, fileName: string): Promise<{ body: Buffer; mimeType: string }> {
    const extension =
      kind === 'crests' ? 'png' : kind === 'portraits' ? 'jpg' : kind === 'photos' ? 'webp' : null
    if (
      !extension ||
      !/^(0[1-9]|1[0-6])\.(png|jpg|webp)$/.test(fileName) ||
      !fileName.endsWith(`.${extension}`)
    )
      throw notFound('演示图片不存在')
    if (!(await assertMediaReadable(this.prisma, `/api/media/demo/${kind}/${fileName}`)))
      throw notFound('图片已下架')
    try {
      return {
        body: await readFile(resolve(DEMO_DIRECTORY, kind, fileName)),
        mimeType:
          extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg',
      }
    } catch {
      throw notFound('演示图片不存在')
    }
  }

  /** Content-addressed profile media; callers must authorize the target and audit the update. */
  async storeProfilePicture(dataUrl: string, wide = false): Promise<StoredAvatar> {
    if (!wide) return this.storeAvatar(dataUrl)
    const image = await normalizePostImage(dataUrl)
    const fileName = `${createHash('sha256').update(image.body).digest('hex')}.webp`
    await mkdir(avatarDirectory(), { recursive: true })
    try {
      await writeFile(resolve(avatarDirectory(), fileName), image.body, { flag: 'wx' })
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
    }
    return {
      avatarUrl: `/api/media/avatars/${fileName}`,
      bytes: image.body.length,
      width: image.width,
      height: image.height,
      mimeType: 'image/webp',
    }
  }

  private async storeAvatar(dataUrl: string): Promise<StoredAvatar> {
    const match = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
    if (!match) throw badAvatar('仅支持裁剪后生成的 WebP、PNG 或 JPEG 头像')
    const body = Buffer.from(match[2]!, 'base64')
    if (body.length < 100 || body.length > MAX_POST_IMAGE_BYTES) {
      throw badAvatar(`头像原图需小于 ${MAX_POST_IMAGE_BYTES / 1024 / 1024} MiB`)
    }
    const normalized = await normalizeAvatarImage(body, match[1]! as AvatarSubtype)

    const hash = createHash('sha256').update(normalized.body).digest('hex')
    const extension = normalized.subtype
    const fileName = `${hash}.${extension}`
    await mkdir(avatarDirectory(), { recursive: true })
    try {
      await writeFile(resolve(avatarDirectory(), fileName), normalized.body, { flag: 'wx' })
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
    }
    return {
      avatarUrl: `/api/media/avatars/${fileName}`,
      bytes: normalized.body.length,
      height: normalized.height,
      mimeType: normalized.mimeType,
      width: normalized.width,
    }
  }

  private async cleanupAvatarIfUnreferenced(avatarUrl: string): Promise<void> {
    const fileName = avatarUrl.split('/').at(-1)
    if (!fileName || !/^[a-f0-9]{64}\.(?:webp|png|jpg)$/.test(fileName)) return
    const [userReferences, playerReferences, auditReferences] = await Promise.all([
      this.prisma.user.count({ where: { avatarUrl } }),
      this.prisma.playerProfile.count({ where: { avatarUrl } }),
      this.prisma.auditLog.count({
        where: {
          OR: [
            { afterSummary: { path: ['avatarUrl'], equals: avatarUrl } },
            { beforeSummary: { path: ['avatarUrl'], equals: avatarUrl } },
          ],
        },
      }),
    ])
    if (userReferences + playerReferences + auditReferences > 0) return
    try {
      await unlink(resolve(avatarDirectory(), fileName))
    } catch {
      // Missing or concurrently cleaned content-addressed files need no further action.
    }
  }
}

function isMediaScope(value: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
}

export async function normalizePostImage(
  dataUrl: string,
): Promise<{ body: Buffer; width: number; height: number }> {
  const match = /^data:image\/(webp|png|jpeg|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match) throw badAvatar('动态图片仅支持 JPEG、PNG、WebP 或 GIF')
  const input = Buffer.from(match[2]!, 'base64')
  if (input.length < 100 || input.length > MAX_POST_IMAGE_BYTES)
    throw badAvatar('动态图片需小于 4 MiB')
  try {
    const metadata = await sharp(input, {
      failOn: 'error',
      limitInputPixels: 24_000_000,
    }).metadata()
    if (metadata.format !== match[1]) throw badAvatar('动态图片内容与格式不一致')
    const frameHeight = metadata.pageHeight ?? metadata.height
    const frames = metadata.pages ?? 1
    if (
      !metadata.width ||
      !frameHeight ||
      metadata.width < 64 ||
      frameHeight < 64 ||
      metadata.width > 8000 ||
      frameHeight > 8000 ||
      frames > 200 ||
      metadata.width * frameHeight * frames > 48_000_000
    )
      throw badAvatar('图片尺寸或动画帧数过大，请选择较小的图片')
    for (const quality of [82, 68, 54]) {
      const output = await sharp(input, {
        animated: true,
        failOn: 'error',
        limitInputPixels: 48_000_000,
      })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer({ resolveWithObject: true })
      if (output.data.length <= (frames > 1 ? MAX_POST_IMAGE_BYTES : MAX_POST_OUTPUT_BYTES))
        return {
          body: output.data,
          width: output.info.width,
          height: Math.round(output.info.height / frames),
        }
    }
  } catch (error) {
    if (error instanceof ApiHttpException) throw error
    throw badAvatar('动态图片无法完整解码，请重新选择')
  }
  throw badAvatar('动态图片过于复杂，请选择较小的照片')
}

export async function normalizeAvatarImage(
  body: Buffer,
  declaredSubtype: AvatarSubtype,
): Promise<{
  body: Buffer
  height: number
  mimeType: 'image/webp'
  subtype: 'webp'
  width: number
}> {
  let metadata: sharp.Metadata
  try {
    metadata = await sharp(body, {
      failOn: 'error',
      limitInputPixels: 48_000_000,
    }).metadata()
  } catch {
    throw badAvatar('头像文件无法完整解码')
  }
  const sourceSubtype = metadata.format === 'jpg' ? 'jpeg' : metadata.format
  if (sourceSubtype !== declaredSubtype) throw badAvatar('头像文件内容与格式不一致')
  const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation ?? 1)
  const width = swapsAxes ? metadata.height : metadata.width
  const height = swapsAxes ? metadata.width : metadata.height
  if (
    !width ||
    !height ||
    width < MIN_AVATAR_EDGE ||
    height < MIN_AVATAR_EDGE ||
    width > 8000 ||
    height > 8000
  ) {
    throw badAvatar(`头像尺寸需在 ${MIN_AVATAR_EDGE}–8000 像素之间`)
  }

  const minDim = Math.min(width, height)
  const edges = [...new Set([Math.min(minDim, 320), Math.min(minDim, 256)])]
  for (const edge of edges) {
    for (const quality of [82, 74, 66, 58]) {
      try {
        const normalized = await sharp(body, {
          failOn: 'error',
          limitInputPixels: 48_000_000,
        })
          .rotate()
          .resize(edge, edge, { fit: 'cover', withoutEnlargement: true })
          .webp({ effort: 4, quality })
          .toBuffer()
        if (normalized.length <= MAX_AVATAR_BYTES) {
          return {
            body: normalized,
            height: edge,
            mimeType: 'image/webp',
            subtype: 'webp',
            width: edge,
          }
        }
      } catch {
        throw badAvatar('头像文件无法完整解码')
      }
    }
  }
  throw badAvatar(`头像压缩后需小于 ${MAX_AVATAR_BYTES / 1024} KiB`)
}

function badAvatar(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.BAD_REQUEST, {
    code: ERROR_CODES.BAD_REQUEST,
    message,
  })
}

function notFound(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.NOT_FOUND, {
    code: ERROR_CODES.NOT_FOUND,
    message,
  })
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}
