import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import { MembershipStatus, NotificationType, UserStatus } from '../generated/prisma/client'
import type { CreateDirectMessageDto } from './social.dto'
import { SocialService } from './social.service'
import { assertInteractionAllowed } from './interaction-policy'

@Injectable()
export class MessagingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(SocialService) private readonly socialService: SocialService,
  ) {}

  async listDirectory(authorization: string | undefined, rawQuery?: string) {
    const session = await this.authService.requireSession(authorization)
    const query = rawQuery?.trim().slice(0, 80)
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId: session.organizationId,
        status: MembershipStatus.ACTIVE,
        userId: { not: session.userId },
        user: {
          status: UserStatus.ACTIVE,
          blockedUsers: {
            none: { organizationId: session.organizationId, blockedUserId: session.userId },
          },
          blockedByUsers: {
            none: { organizationId: session.organizationId, blockerUserId: session.userId },
          },
          ...(query ? { displayName: { contains: query, mode: 'insensitive' as const } } : {}),
        },
      },
      include: { user: { include: { playerProfile: true } } },
      orderBy: { user: { displayName: 'asc' } },
      take: query ? 50 : 300,
    })
    return {
      items: memberships.map(({ user }) => mapUser(user, session.organizationId)),
    }
  }

  async listConversations(authorization: string | undefined) {
    const session = await this.authService.requireSession(authorization)
    const conversations = await this.prisma.directConversation.findMany({
      where: {
        organizationId: session.organizationId,
        OR: [{ userOneId: session.userId }, { userTwoId: session.userId }],
      },
      include: {
        userOne: { include: { playerProfile: true } },
        userTwo: { include: { playerProfile: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    })
    const unreadCounts = await this.prisma.directMessage.groupBy({
      by: ['conversationId'],
      where: {
        organizationId: session.organizationId,
        senderUserId: { not: session.userId },
        readAt: null,
        conversation: {
          OR: [{ userOneId: session.userId }, { userTwoId: session.userId }],
        },
        OR: [
          { kind: 'ADMIN_NOTICE' },
          {
            sender: {
              blockedUsers: {
                none: { organizationId: session.organizationId, blockedUserId: session.userId },
              },
              blockedByUsers: {
                none: { organizationId: session.organizationId, blockerUserId: session.userId },
              },
            },
          },
        ],
      },
      _count: { _all: true },
    })
    const unreadByConversation = new Map(
      unreadCounts.map((item) => [item.conversationId, item._count._all]),
    )
    const blocked = await this.prisma.userBlock.findMany({
      where: {
        organizationId: session.organizationId,
        OR: [{ blockerUserId: session.userId }, { blockedUserId: session.userId }],
      },
      select: { blockerUserId: true, blockedUserId: true },
    })
    const blockedIds = new Set(
      blocked.map((row) =>
        row.blockerUserId === session.userId ? row.blockedUserId : row.blockerUserId,
      ),
    )
    return {
      canSend: canSendDirectMessages(session),
      items: conversations.map((conversation) => {
        const counterpart =
          conversation.userOneId === session.userId ? conversation.userTwo : conversation.userOne
        const latest = conversation.messages[0]
        return {
          id: conversation.id,
          counterpart: mapUser(counterpart, session.organizationId),
          canSend: !blockedIds.has(counterpart.id),
          blocked: blockedIds.has(counterpart.id),
          lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
          latestMessage: latest
            ? {
                id: latest.id,
                body: visibleMessageBody(latest),
                isMine: latest.senderUserId === session.userId,
                createdAt: latest.createdAt.toISOString(),
                ...messageNotice(latest),
              }
            : null,
          unreadCount: unreadByConversation.get(conversation.id) ?? 0,
        }
      }),
    }
  }

  async listMessages(authorization: string | undefined, conversationId: string) {
    const session = await this.authService.requireSession(authorization)
    const conversation = await this.requireParticipant(session, conversationId)
    const messages = await this.prisma.directMessage.findMany({
      where: { organizationId: session.organizationId, conversationId },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    const counterpart =
      conversation.userOneId === session.userId ? conversation.userTwo : conversation.userOne
    const blocked = Boolean(
      await this.prisma.userBlock.findFirst({
        where: {
          organizationId: session.organizationId,
          OR: [
            { blockerUserId: session.userId, blockedUserId: counterpart.id },
            { blockerUserId: counterpart.id, blockedUserId: session.userId },
          ],
        },
        select: { id: true },
      }),
    )
    return {
      conversation: {
        id: conversation.id,
        counterpart: mapUser(counterpart, session.organizationId),
        canSend: !blocked,
        blocked,
      },
      items: messages.reverse().map((message) => ({
        id: message.id,
        clientMessageId: message.clientMessageId,
        body: visibleMessageBody(message),
        isMine: message.senderUserId === session.userId,
        readAt: message.readAt?.toISOString() ?? null,
        createdAt: message.createdAt.toISOString(),
        ...messageNotice(message),
      })),
    }
  }

  async markConversationRead(authorization: string | undefined, conversationId: string) {
    const session = await this.authService.requireSession(authorization)
    await this.requireParticipant(session, conversationId)
    const readAt = new Date()
    await this.prisma.$transaction([
      this.prisma.directMessage.updateMany({
        where: {
          organizationId: session.organizationId,
          conversationId,
          senderUserId: { not: session.userId },
          readAt: null,
          createdAt: { lte: readAt },
        },
        data: { readAt },
      }),
      this.prisma.userNotification.updateMany({
        where: {
          organizationId: session.organizationId,
          recipientUserId: session.userId,
          type: NotificationType.DIRECT_MESSAGE,
          readAt: null,
          metadata: { path: ['conversationId'], equals: conversationId },
          createdAt: { lte: readAt },
        },
        data: { readAt },
      }),
    ])
    return this.listMessages(authorization, conversationId)
  }

  async sendMessage(
    authorization: string | undefined,
    recipientUserId: string,
    input: CreateDirectMessageDto,
  ) {
    const session = await this.authService.requireSession(authorization)
    const body = input.body.trim()
    if (!canSendDirectMessages(session))
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '请使用当前组织的有效账号发送私信',
      })
    const result = await this.prisma.$transaction(async (tx) => {
      if (recipientUserId === session.userId) throw badRequest('不能给自己发送私信')
      const recipient = await tx.organizationMembership.findFirst({
        where: {
          organizationId: session.organizationId,
          userId: recipientUserId,
          status: MembershipStatus.ACTIVE,
          user: { status: UserStatus.ACTIVE },
        },
        select: { userId: true },
      })
      if (!recipient) throw notFound('该用户不在当前组织或已停用')
      const canonicalRecipientId = recipient.userId
      if (canonicalRecipientId === session.userId) throw badRequest('不能给自己发送私信')
      await assertInteractionAllowed(tx, session.organizationId, session.userId, [
        canonicalRecipientId,
      ])
      const [userOneId, userTwoId] =
        session.userId < canonicalRecipientId
          ? [session.userId, canonicalRecipientId]
          : [canonicalRecipientId, session.userId]
      const conversation = await tx.directConversation.upsert({
        where: {
          organizationId_userOneId_userTwoId: {
            organizationId: session.organizationId,
            userOneId,
            userTwoId,
          },
        },
        create: { organizationId: session.organizationId, userOneId, userTwoId },
        update: {},
      })
      const stored = await tx.directMessage.upsert({
        where: {
          conversationId_senderUserId_clientMessageId: {
            conversationId: conversation.id,
            senderUserId: session.userId,
            clientMessageId: input.clientMessageId,
          },
        },
        create: {
          organizationId: session.organizationId,
          conversationId: conversation.id,
          senderUserId: session.userId,
          clientMessageId: input.clientMessageId,
          body,
        },
        update: {},
      })
      if (stored.body !== body) {
        throw conflict('同一消息编号已用于其他内容，请重新发送')
      }
      await tx.directConversation.updateMany({
        where: {
          id: conversation.id,
          organizationId: session.organizationId,
          OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: stored.createdAt } }],
        },
        data: { lastMessageAt: stored.createdAt },
      })
      await this.socialService.notify(
        {
          actorUserId: session.userId,
          body: '你收到一条新私信，请在消息中心查看。',
          deduplicationKey: `direct-message:${stored.id}`,
          linkPath: `/pages/me/index?conversationId=${encodeURIComponent(conversation.id)}`,
          metadata: { conversationId: conversation.id },
          organizationId: session.organizationId,
          recipientUserId: canonicalRecipientId,
          title: `${session.user.displayName} 发来私信`,
          type: NotificationType.DIRECT_MESSAGE,
        },
        tx,
      )
      return { conversationId: conversation.id, message: stored }
    })
    return {
      conversationId: result.conversationId,
      message: {
        id: result.message.id,
        clientMessageId: result.message.clientMessageId,
        body: visibleMessageBody(result.message),
        isMine: true,
        readAt: null,
        createdAt: result.message.createdAt.toISOString(),
        ...messageNotice(result.message),
      },
    }
  }

  private async requireParticipant(session: AuthenticatedSession, conversationId: string) {
    const conversation = await this.prisma.directConversation.findFirst({
      where: {
        id: conversationId,
        organizationId: session.organizationId,
        OR: [{ userOneId: session.userId }, { userTwoId: session.userId }],
      },
      include: {
        userOne: { include: { playerProfile: true } },
        userTwo: { include: { playerProfile: true } },
      },
    })
    if (!conversation) throw notFound('私信会话不存在')
    return conversation
  }
}

export function canSendDirectMessages(session: AuthenticatedSession): boolean {
  // requireSession already verifies active user, membership, organization and token.
  return Boolean(session.userId && session.organizationId)
}

export function visibleMessageBody(message: { body: string; moderationStatus?: string }): string {
  return message.moderationStatus === 'HIDDEN' ? '该消息已由管理员隐藏' : message.body
}

export function messageNotice(message: {
  kind?: string
  metadata?: unknown
  moderationStatus?: string
}) {
  const data =
    message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
      ? (message.metadata as Record<string, unknown>)
      : null
  const notice =
    message.kind === 'ADMIN_NOTICE' &&
    message.moderationStatus !== 'HIDDEN' &&
    data &&
    ['title', 'applicationId', 'deadlineAt', 'actionPath'].every(
      (key) => typeof data[key] === 'string',
    )
      ? {
          title: String(data.title),
          applicationId: String(data.applicationId),
          deadlineAt: String(data.deadlineAt),
          actionPath: String(data.actionPath),
        }
      : null
  return { kind: notice ? ('ADMIN_NOTICE' as const) : ('USER' as const), notice }
}

function mapUser(
  user: {
    id: string
    displayName: string
    avatarUrl: string | null
    playerProfile: { organizationId: string; avatarUrl: string | null } | null
  },
  _organizationId: string,
) {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  }
}

function badRequest(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.BAD_REQUEST, {
    code: ERROR_CODES.BAD_REQUEST,
    message,
  })
}

function conflict(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.CONFLICT, {
    code: ERROR_CODES.CONFLICT,
    message,
  })
}

function notFound(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.NOT_FOUND, {
    code: ERROR_CODES.NOT_FOUND,
    message,
  })
}
