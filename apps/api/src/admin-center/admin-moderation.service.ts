import { Inject, Injectable, Optional } from '@nestjs/common'
import { notifyPublishedPostMentions } from '../social/post-mentions'
import { AdminCenterService } from './admin-center.service'
import { AdminMediaService } from './admin-media.service'
import { centerError } from './admin-center.policy'
import type {
  AdminContentDecisionDto,
  AdminCenterReasonDto,
  AdminDirectMessagesQueryDto,
  AdminDirectMessageDecisionDto,
  AdminCenterPageDto,
  AdminRegistrationFeedbackDecisionDto,
  AdminSystemMessageDto,
} from './admin-center.dto'
import { postImageUrls } from '../media/media.service'
import { AiModerationService } from '../ai-moderation/ai-moderation.service'

@Injectable()
export class AdminModerationService {
  constructor(
    @Inject(AdminCenterService) private readonly center: AdminCenterService,
    @Inject(AdminMediaService) private readonly media: AdminMediaService,
    @Optional() @Inject(AiModerationService) private readonly aiModeration?: AiModerationService,
  ) {}
  detail(auth: string | undefined, id: string) {
    return this.center.read(auth, async (tx, actor) => {
      const post = await tx.post.findFirst({
        where: { id, organizationId: actor.organizationId },
        include: {
          author: { select: { id: true, displayName: true } },
          comments: {
            orderBy: { createdAt: 'asc' },
            take: 200,
            include: { user: { select: { id: true, displayName: true } } },
          },
        },
      })
      if (!post) throw centerError(404, '动态不存在')
      return {
        ...post,
        imageUrls: postImageUrls(post.imageUrl),
        comments: post.comments.map((comment) => ({
          ...comment,
          imageUrls: postImageUrls(comment.imageUrl),
        })),
      }
    })
  }
  notify(
    auth: string | undefined,
    body: AdminSystemMessageDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.center.write(
      auth,
      'POST /admin/center/system-notifications',
      body,
      key,
      async (tx, actor) => {
        const member = await tx.organizationMembership.findFirst({
          where: {
            organizationId: actor.organizationId,
            userId: body.recipientUserId,
            status: 'ACTIVE',
          },
        })
        if (!member) throw centerError(404, '用户不在当前组织')
        const note = await tx.userNotification.create({
          data: {
            organizationId: actor.organizationId,
            recipientUserId: body.recipientUserId,
            actorUserId: actor.userId,
            type: 'SYSTEM_MESSAGE',
            title: body.title,
            body: body.body,
            linkPath: '/pages/me/index',
          },
        })
        await this.center.auditWrite(
          tx,
          actor,
          'SYSTEM_MESSAGE_SENT',
          'User',
          body.recipientUserId,
          body.reason,
          requestId,
          null,
          { notificationId: note.id, title: body.title },
        )
        return { sent: true }
      },
    )
  }
  registrationFeedback(auth: string | undefined, query: AdminCenterPageDto) {
    return this.center.read(auth, async (tx, actor) => {
      const where = { organizationId: actor.organizationId }
      const [items, total, pendingCount] = await Promise.all([
        tx.registrationHelpRequest.findMany({
          where,
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.registrationHelpRequest.count({ where }),
        tx.registrationHelpRequest.count({ where: { ...where, status: 'OPEN' } }),
      ])
      return { items, total, pendingCount, page: query.page, pageSize: query.pageSize }
    })
  }
  resolveRegistrationFeedback(
    auth: string | undefined,
    id: string,
    body: AdminRegistrationFeedbackDecisionDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.center.write(
      auth,
      `POST /admin/center/registration-feedback/${id}/decisions`,
      body,
      key,
      async (tx, actor) => {
        const result = await tx.registrationHelpRequest.updateMany({
          where: {
            id,
            organizationId: actor.organizationId,
            status: 'OPEN',
            version: body.expectedVersion,
          },
          data: { status: 'RESOLVED', resolution: body.reason, version: { increment: 1 } },
        })
        if (result.count !== 1) throw centerError(409, '反馈已处理或记录已变化，请刷新核对')
        await this.center.auditWrite(
          tx,
          actor,
          'REGISTRATION_HELP_RESOLVED',
          'RegistrationHelpRequest',
          id,
          body.reason,
          requestId,
          { status: 'OPEN', version: body.expectedVersion },
          { status: 'RESOLVED', version: body.expectedVersion + 1 },
        )
        return { id, status: 'RESOLVED', version: body.expectedVersion + 1 }
      },
    )
  }
  messages(auth: string | undefined, query: AdminDirectMessagesQueryDto, requestId: string) {
    return this.center.read(auth, async (tx, actor) => {
      const where = {
        organizationId: actor.organizationId,
        ...(query.status ? { moderationStatus: query.status } : {}),
        ...(query.query
          ? {
              conversation: {
                OR: [
                  {
                    userOne: {
                      displayName: { contains: query.query, mode: 'insensitive' as const },
                    },
                  },
                  {
                    userTwo: {
                      displayName: { contains: query.query, mode: 'insensitive' as const },
                    },
                  },
                ],
              },
            }
          : {}),
      }
      const [rows, total] = await Promise.all([
        tx.directMessage.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            sender: { select: { id: true, displayName: true } },
            conversation: {
              select: {
                userOne: { select: { id: true, displayName: true } },
                userTwo: { select: { id: true, displayName: true } },
              },
            },
          },
        }),
        tx.directMessage.count({ where }),
      ])
      await this.center.auditWrite(
        tx,
        actor,
        'DIRECT_MESSAGE_QUEUE_VIEWED',
        'PrivateMessageQueue',
        actor.organizationId,
        '管理中心人工复核私信',
        requestId,
        null,
        { count: rows.length },
      )
      return {
        items: rows.map((row) => ({
          id: row.id,
          body: row.body,
          sender: row.sender,
          recipient:
            row.senderUserId === row.conversation.userOne.id
              ? row.conversation.userTwo
              : row.conversation.userOne,
          createdAt: row.createdAt.toISOString(),
          status: row.moderationStatus,
          version: row.moderationVersion,
          moderatedAt: row.moderatedAt?.toISOString() ?? null,
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
      }
    })
  }
  messageDecision(
    auth: string | undefined,
    id: string,
    body: AdminDirectMessageDecisionDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.center.write(
      auth,
      `POST /admin/center/messages/${id}/decisions`,
      body,
      key,
      async (tx, actor) => {
        const current = await tx.directMessage.findFirst({
          where: { id, organizationId: actor.organizationId },
        })
        if (!current) throw centerError(404, '本组织不存在该私信')
        if (body.action === 'RESTORE' && current.moderationStatus !== 'HIDDEN')
          throw centerError(409, '只有已隐藏私信可以恢复')
        if (body.action === 'APPROVE' && current.moderationStatus === 'HIDDEN')
          throw centerError(409, '已隐藏私信请使用恢复操作')
        const status = body.action === 'HIDE' ? 'HIDDEN' : 'APPROVED'
        const changed = await tx.directMessage.updateMany({
          where: {
            id,
            organizationId: actor.organizationId,
            moderationVersion: body.expectedVersion,
          },
          data: {
            moderationStatus: status,
            moderationVersion: { increment: 1 },
            moderatedAt: new Date(),
          },
        })
        if (changed.count !== 1) throw centerError(409, '私信已由其他管理员处理，请刷新核对')
        await tx.userNotification.updateMany({
          where: { organizationId: actor.organizationId, deduplicationKey: `direct-message:${id}` },
          data: {
            body:
              status === 'HIDDEN'
                ? '这条私信已由管理员隐藏。'
                : '你收到一条新私信，请在消息中心查看。',
          },
        })
        await this.center.auditWrite(
          tx,
          actor,
          'DIRECT_MESSAGE_' +
            (status === 'HIDDEN' ? 'HIDDEN' : body.action === 'RESTORE' ? 'RESTORED' : 'APPROVED'),
          'DirectMessage',
          id,
          body.reason,
          requestId,
          { status: current.moderationStatus, version: current.moderationVersion },
          { status, version: current.moderationVersion + 1 },
        )
        return { id, status, version: current.moderationVersion + 1 }
      },
    )
  }
  capabilities(auth: string | undefined) {
    return this.center.read(auth, async (_tx, actor) => {
      let publicMediaGuardReady = false
      try {
        const response = await fetch(
          (
            process.env.PUBLIC_API_BASE_URL || `http://127.0.0.1:${process.env.API_PORT || 3001}`
          ).replace(/\/api\/?$/, '') + '/api/media/guard-status',
          { signal: AbortSignal.timeout(2500) },
        )
        if (response.ok) {
          const status = (await response.json()) as { guardVersion?: number }
          publicMediaGuardReady = status.guardVersion === 1
        }
      } catch {
        /* A missing public gate must remain explicitly unverified. */
      }
      return {
        publicMediaGuardReady,
        aiConfigured:
          Boolean(process.env.ADMIN_AI_MODERATION_URL) ||
          (this.aiModeration
            ? (await this.aiModeration.config(actor.organizationId)).enabled
            : false),
        aiMode: 'ADVISORY',
        description: '人工审核可用；AI通过显式配置的HTTP审核服务接入，不会自动封禁账号。',
      }
    })
  }
  decision(
    auth: string | undefined,
    id: string,
    body: AdminContentDecisionDto,
    key: string | undefined,
    requestId: string,
  ) {
    if (body.action !== 'APPROVE' && body.reason.trim().length < 2)
      throw centerError(400, '下架或恢复内容时请填写原因')
    return this.center.write(
      auth,
      `POST /admin/center/posts/${id}/decisions`,
      body,
      key,
      async (tx, actor) => {
        const current = await tx.post.findFirst({
          where: { id, organizationId: actor.organizationId },
        })
        if (!current) throw centerError(404, '本组织不存在该帖子')
        body.reason = body.reason.trim() || '审核通过'
        const status = body.action === 'BLOCK' ? 'HIDDEN' : 'PUBLISHED'
        const updated = await tx.post.updateMany({
          where: {
            id,
            organizationId: actor.organizationId,
            updatedAt: new Date(body.expectedUpdatedAt),
          },
          data: { status },
        })
        if (updated.count !== 1) throw centerError(409, '帖子已被修改，请刷新核对')
        if (status === 'PUBLISHED') await notifyPublishedPostMentions(tx, actor.organizationId, id)
        await tx.aiModerationReview.updateMany({
          where: {
            organizationId: actor.organizationId,
            resourceType: 'POST',
            targetId: id,
            reviewedAt: null,
          },
          data: {
            status: 'DONE',
            needsHumanReview: false,
            reviewedAt: new Date(),
            reviewedByUserId: actor.userId,
            leaseUntil: null,
          },
        })
        if (body.action === 'BLOCK' && current.authorUserId)
          await tx.userNotification.createMany({
            data: [
              {
                organizationId: actor.organizationId,
                recipientUserId: current.authorUserId,
                actorUserId: actor.userId,
                type: 'SYSTEM_MESSAGE',
                title: '你的动态已下架',
                body: body.reason,
                linkPath: '/pages/me/index',
                deduplicationKey: `post-block:${id}:${current.updatedAt.toISOString()}`,
              },
            ],
            skipDuplicates: true,
          })
        await this.center.auditWrite(
          tx,
          actor,
          body.action === 'BLOCK'
            ? 'POST_BLOCKED'
            : body.action === 'APPROVE'
              ? 'POST_APPROVED'
              : 'POST_RESTORED',
          'Post',
          id,
          body.reason,
          requestId,
          { status: current.status },
          { status },
        )
        return {
          id,
          status,
          updatedAt: (
            await tx.post.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })
          ).updatedAt.toISOString(),
        }
      },
    )
  }
  async ai(
    auth: string | undefined,
    type: 'POST' | 'MEDIA',
    idOrUrl: string,
    reason: AdminCenterReasonDto,
  ) {
    await this.center.read(auth, async () => true)
    if (this.aiModeration) {
      const service = this.aiModeration
      const org = await this.center.read(auth, async (_tx, actor) => actor.organizationId)
      if ((await service.config(org)).enabled) {
        const match =
          type === 'MEDIA'
            ? /\/api\/media-assets\/([a-f0-9-]{36})\/(?:content|poster)/.exec(idOrUrl)
            : null
        const target = type === 'POST' ? idOrUrl : match?.[1]
        if (!target) throw centerError(409, '这类图片请在AI辅助审核中查看自动审核记录')
        const id = await this.center.read(auth, async (tx, actor) => {
          await service.enqueue(
            tx,
            actor.organizationId,
            type === 'POST' ? 'POST' : 'MEDIA',
            target,
          )
          return (
            await tx.aiModerationReview.findFirst({
              where: {
                organizationId: actor.organizationId,
                resourceType: type === 'POST' ? 'POST' : 'MEDIA',
                targetId: target,
              },
              orderBy: { createdAt: 'desc' },
            })
          )?.id
        })
        if (id) await service.retry(org, id)
        return { decision: 'REVIEW', summary: '已加入AI审核队列，可在AI辅助审核中查看结果。' }
      }
    }
    if (!process.env.ADMIN_AI_MODERATION_URL)
      throw centerError(409, 'AI审核服务尚未配置。人工审核和封禁可正常使用。')
    const input = await this.center.read(auth, async (tx, actor) => {
      if (type === 'POST') {
        const post = await tx.post.findFirst({
          where: { id: idOrUrl, organizationId: actor.organizationId },
          select: { id: true, title: true, body: true, imageUrl: true, updatedAt: true },
        })
        if (!post) throw centerError(404, '帖子不在当前组织')
        return {
          type,
          id: post.id,
          title: post.title,
          text: post.body,
          images: postImageUrls(post.imageUrl),
          version: post.updatedAt.toISOString(),
        }
      }
      return {
        type,
        id: idOrUrl,
        text: '',
        images: [idOrUrl],
        version: null,
      }
    })
    const images = await Promise.all(
      input.images.map(async (url) => {
        const preview = await this.media.preview(auth, url)
        return `data:${preview.mimeType};base64,${preview.body.toString('base64')}`
      }),
    )
    let result: unknown
    try {
      const response = await fetch(process.env.ADMIN_AI_MODERATION_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.ADMIN_AI_MODERATION_KEY
            ? { authorization: `Bearer ${process.env.ADMIN_AI_MODERATION_KEY}` }
            : {}),
        },
        body: JSON.stringify({ protocol: 'xiaoqiu-moderation-v1', ...input, images }),
        signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) throw new Error('AI服务返回失败')
      result = await response.json()
    } catch {
      throw centerError(503, 'AI审核请求失败或超时，本次未自动执行封禁')
    }
    if (
      !result ||
      typeof result !== 'object' ||
      !('decision' in result) ||
      !['ALLOW', 'REVIEW', 'BLOCK'].includes(String(result.decision)) ||
      !('summary' in result) ||
      typeof result.summary !== 'string' ||
      !result.summary.trim() ||
      result.summary.length > 2000
    )
      throw centerError(503, 'AI审核响应不符合协议，本次不执行处理')
    const safe = {
      decision: String(result.decision),
      summary: result.summary,
      reviewedAt: new Date().toISOString(),
      automaticAction: false,
    }
    await this.center.read(auth, async (tx, actor) =>
      this.center.auditWrite(
        tx,
        actor,
        'AI_MODERATION_REVIEWED',
        type === 'POST' ? 'Post' : 'MediaURL',
        type === 'POST' ? idOrUrl : 'image-review',
        reason.reason,
        'ai-review',
        null,
        { decision: safe.decision, count: 1 },
      ),
    )
    return safe
  }
}
