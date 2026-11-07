import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from '../common/api-http.exception'
import type { Prisma } from '../generated/prisma/client'

export interface AdminNoticeInput {
  organizationId: string
  senderUserId: string
  recipientUserId: string
  clientMessageId: string
  title: string
  body: string
  applicationId: string
  deadlineAt: string
  actionPath: string
}

/** Only call after an authorized administrator command, inside that command's transaction. */
export async function createAdminNotice(tx: Prisma.TransactionClient, input: AdminNoticeInput) {
  const members = await tx.organizationMembership.count({
    where: {
      organizationId: input.organizationId,
      userId: { in: [input.senderUserId, input.recipientUserId] },
      status: 'ACTIVE',
      user: { status: 'ACTIVE' },
    },
  })
  if (members !== 2 || input.senderUserId === input.recipientUserId)
    throw new ApiHttpException(HttpStatus.CONFLICT, {
      code: ERROR_CODES.CONFLICT,
      message: '管理员或收件账号已不在当前组织，请刷新后重试',
    })
  const [userOneId, userTwoId] = [input.senderUserId, input.recipientUserId].sort() as [
    string,
    string,
  ]
  const conversation = await tx.directConversation.upsert({
    where: {
      organizationId_userOneId_userTwoId: {
        organizationId: input.organizationId,
        userOneId,
        userTwoId,
      },
    },
    create: { organizationId: input.organizationId, userOneId, userTwoId },
    update: {},
  })
  const metadata = {
    title: input.title,
    applicationId: input.applicationId,
    deadlineAt: input.deadlineAt,
    actionPath: input.actionPath,
  }
  const message = await tx.directMessage.upsert({
    where: {
      conversationId_senderUserId_clientMessageId: {
        conversationId: conversation.id,
        senderUserId: input.senderUserId,
        clientMessageId: input.clientMessageId,
      },
    },
    create: {
      organizationId: input.organizationId,
      conversationId: conversation.id,
      senderUserId: input.senderUserId,
      clientMessageId: input.clientMessageId,
      body: input.body,
      kind: 'ADMIN_NOTICE',
      metadata,
      moderationStatus: 'APPROVED',
    },
    update: {},
  })
  if (
    message.kind !== 'ADMIN_NOTICE' ||
    message.body !== input.body ||
    JSON.stringify(message.metadata) !== JSON.stringify(metadata)
  ) {
    // PostgreSQL jsonb key order is not stable; compare named fields before declaring conflict.
    const saved = message.metadata as Record<string, unknown> | null
    if (
      message.kind !== 'ADMIN_NOTICE' ||
      message.body !== input.body ||
      Object.entries(metadata).some(([key, value]) => saved?.[key] !== value)
    )
      throw new ApiHttpException(HttpStatus.CONFLICT, {
        code: ERROR_CODES.CONFLICT,
        message: '同一审核通知编号已用于其他内容',
      })
  }
  await tx.directConversation.updateMany({
    where: {
      id: conversation.id,
      OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: message.createdAt } }],
    },
    data: { lastMessageAt: message.createdAt },
  })
  await tx.userNotification.upsert({
    where: {
      recipientUserId_deduplicationKey: {
        recipientUserId: input.recipientUserId,
        deduplicationKey: `direct-message:${message.id}`,
      },
    },
    create: {
      organizationId: input.organizationId,
      recipientUserId: input.recipientUserId,
      actorUserId: input.senderUserId,
      type: 'DIRECT_MESSAGE',
      title: input.title,
      body: '管理员发来身份资料核验通知，请在私信中查看。',
      linkPath: `/pages/messages/index?conversationId=${conversation.id}`,
      metadata: { conversationId: conversation.id, kind: 'ADMIN_NOTICE' },
      deduplicationKey: `direct-message:${message.id}`,
    },
    update: {},
  })
  return { conversationId: conversation.id, messageId: message.id }
}
