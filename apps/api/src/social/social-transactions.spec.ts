import assert from 'node:assert/strict'
import test from 'node:test'

import { HttpStatus } from '@nestjs/common'

import type { AuthenticatedSession, AuthService } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import type { PrismaService } from '../database/prisma.service'
import { ExperienceService } from '../experience/experience.service'
import { MediaService } from '../media/media.service'
import { MessagingService } from './messaging.service'
import { SocialService } from './social.service'

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'
const OTHER_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000099'
const AUTHOR_ID = '00000000-0000-4000-8000-000000000010'
const ACTOR_ID = '00000000-0000-4000-8000-000000000011'
const RECIPIENT_ID = '00000000-0000-4000-8000-000000000012'
const THIRD_USER_ID = '00000000-0000-4000-8000-000000000013'
const POST_ID = '00000000-0000-4000-8000-000000000020'
const TEAM_ID = '00000000-0000-4000-8000-000000000030'
const APPLICATION_ID = '00000000-0000-4000-8000-000000000040'

type NotificationRow = {
  actorUserId: string | null
  body: string | null
  deduplicationKey: string | null
  id: string
  organizationId: string
  recipientUserId: string
  type: string
}

function makeSession(
  userId = ACTOR_ID,
  roles: Array<{ role: string; scopeId: string; scopeType: string }> = [],
): AuthenticatedSession {
  return {
    sessionId: `session-${userId}`,
    userId,
    organizationId: ORGANIZATION_ID,
    user: {
      id: userId,
      organizationId: ORGANIZATION_ID,
      username: `user-${userId.slice(-2)}`,
      displayName: `用户${userId.slice(-2)}`,
      realName: null,
      studentId: null,
      email: null,
      bio: null,
      avatarUrl: null,
      verificationLevel: 'STUDENT_VERIFIED',
      roles,
      linkedPlayer: null,
    },
  }
}

function authStub(session: AuthenticatedSession) {
  return {
    requireSession: async () => session,
  } as unknown as AuthService
}

function assertHttpStatus(error: unknown, expected: HttpStatus): boolean {
  assert.ok(error instanceof ApiHttpException)
  assert.equal(error.getStatus(), expected)
  return true
}

class CommunityPrismaFake {
  comments: Array<{
    body: string
    clientCommentId: string
    createdAt: Date
    id: string
    organizationId: string
    parentCommentId: string | null
    postId: string
    user: {
      avatarUrl: string | null
      displayName: string
      id: string
      verificationLevel: string
    }
    userId: string
  }> = []

  notifications: NotificationRow[] = []
  failNotification = false
  private nextId = 1
  private transactionDepth = 0

  post = {
    findUnique: async () => null,
    findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
      where.id === POST_ID && where.organizationId === ORGANIZATION_ID
        ? { id: POST_ID, authorUserId: AUTHOR_ID }
        : null,
  }

  postComment = {
    findFirst: async () => null,
    createMany: async ({
      data,
    }: {
      data: Array<{
        body: string
        clientCommentId: string
        organizationId: string
        parentCommentId: string | null
        postId: string
        userId: string
      }>
    }) => {
      let count = 0
      for (const create of data) {
        if (
          this.comments.some(
            (item) =>
              item.userId === create.userId && item.clientCommentId === create.clientCommentId,
          )
        )
          continue
        const stored = {
          ...create,
          id: `comment-${this.nextId++}`,
          createdAt: new Date('2026-09-02T08:00:00.000Z'),
          updatedAt: new Date('2026-09-02T08:00:00.000Z'),
          _count: { likes: 0 },
          likes: [],
          user: {
            id: create.userId,
            displayName: '评论用户',
            verificationLevel: 'STUDENT_VERIFIED',
            avatarUrl: null,
          },
        }
        this.comments.push(stored)
        count += 1
      }
      return { count }
    },
    findUnique: async ({
      where,
    }: {
      where: { userId_clientCommentId: { clientCommentId: string; userId: string } }
    }) => {
      const key = where.userId_clientCommentId
      return (
        this.comments.find(
          (item) => item.userId === key.userId && item.clientCommentId === key.clientCommentId,
        ) ?? null
      )
    },
  }

  userNotification = {
    upsert: async ({
      create,
      where,
    }: {
      create: Omit<NotificationRow, 'id'>
      where: {
        recipientUserId_deduplicationKey: {
          deduplicationKey: string
          recipientUserId: string
        }
      }
    }) => {
      assert.ok(this.transactionDepth > 0, 'comment notification must use transaction client')
      if (this.failNotification) throw new Error('notification insert failed')
      const key = where.recipientUserId_deduplicationKey
      const existing = this.notifications.find(
        (item) =>
          item.recipientUserId === key.recipientUserId &&
          item.deduplicationKey === key.deduplicationKey,
      )
      if (existing) return existing
      const stored = { ...create, id: `notification-${this.nextId++}` }
      this.notifications.push(stored)
      return stored
    },
    create: async ({ data }: { data: Omit<NotificationRow, 'id'> }) => {
      assert.ok(this.transactionDepth > 0, 'comment notification must use transaction client')
      if (this.failNotification) throw new Error('notification insert failed')
      const stored = { ...data, id: `notification-${this.nextId++}` }
      this.notifications.push(stored)
      return stored
    },
  }

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    const comments = structuredClone(this.comments)
    const notifications = structuredClone(this.notifications)
    this.transactionDepth += 1
    try {
      return await callback(this)
    } catch (error) {
      this.comments.splice(0, this.comments.length, ...comments)
      this.notifications.splice(0, this.notifications.length, ...notifications)
      throw error
    } finally {
      this.transactionDepth -= 1
    }
  }
}

function makeCommunityServices(prisma: CommunityPrismaFake) {
  const auth = authStub(makeSession())
  const social = new SocialService(prisma as unknown as PrismaService, auth)
  const experience = new ExperienceService(
    prisma as unknown as PrismaService,
    auth,
    social,
    new MediaService(prisma as unknown as PrismaService, auth),
  )
  return { experience, social }
}

test('comment client key is idempotent and rejects reuse with different body', async () => {
  const prisma = new CommunityPrismaFake()
  const { experience } = makeCommunityServices(prisma)
  const input = { clientCommentId: 'comment-key-0001', body: '同一条评论' }

  const first = await experience.createComment('Bearer token', POST_ID, input)
  const duplicate = await experience.createComment('Bearer token', POST_ID, input)

  assert.equal(first.id, duplicate.id)
  assert.equal(prisma.comments.length, 1)
  assert.equal(prisma.notifications.length, 1)
  await assert.rejects(
    experience.createComment('Bearer token', POST_ID, {
      clientCommentId: input.clientCommentId,
      body: '被篡改的评论',
    }),
    (error: unknown) => assertHttpStatus(error, HttpStatus.CONFLICT),
  )
  assert.equal(prisma.comments.length, 1)
  assert.equal(prisma.notifications.length, 1)
})

test('comment and its notification roll back together when notification persistence fails', async () => {
  const prisma = new CommunityPrismaFake()
  prisma.failNotification = true
  const { experience } = makeCommunityServices(prisma)

  await assert.rejects(
    experience.createComment('Bearer token', POST_ID, {
      clientCommentId: 'comment-key-rollback',
      body: '这条评论不能成为孤儿写入',
    }),
    /notification insert failed/,
  )
  assert.equal(prisma.comments.length, 0)
  assert.equal(prisma.notifications.length, 0)
})

type MessageUser = {
  avatarUrl: string | null
  displayName: string
  id: string
  playerProfile: null
}

type ConversationRow = {
  createdAt: Date
  id: string
  lastMessageAt: Date | null
  organizationId: string
  userOne: MessageUser
  userOneId: string
  userTwo: MessageUser
  userTwoId: string
}

class MessagingPrismaFake {
  conversations: ConversationRow[] = []
  messages: Array<{
    body: string
    clientMessageId: string
    conversationId: string
    createdAt: Date
    id: string
    organizationId: string
    readAt: Date | null
    senderUserId: string
  }> = []
  notifications: NotificationRow[] = []
  memberships = new Map<string, string>([[RECIPIENT_ID, ORGANIZATION_ID]])
  failNotification = false
  private nextId = 1
  private transactionDepth = 0

  organizationMembership = {
    findFirst: async ({ where }: { where: { organizationId: string; userId: string } }) =>
      this.memberships.get(where.userId) === where.organizationId ? { userId: where.userId } : null,
  }

  directConversation = {
    upsert: async ({
      create,
      where,
    }: {
      create: { organizationId: string; userOneId: string; userTwoId: string }
      where: {
        organizationId_userOneId_userTwoId: {
          organizationId: string
          userOneId: string
          userTwoId: string
        }
      }
    }) => {
      const key = where.organizationId_userOneId_userTwoId
      const existing = this.conversations.find(
        (item) =>
          item.organizationId === key.organizationId &&
          item.userOneId === key.userOneId &&
          item.userTwoId === key.userTwoId,
      )
      if (existing) return existing
      const stored: ConversationRow = {
        ...create,
        id: `conversation-${this.nextId++}`,
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        lastMessageAt: null,
        userOne: makeMessageUser(create.userOneId),
        userTwo: makeMessageUser(create.userTwoId),
      }
      this.conversations.push(stored)
      return stored
    },
    updateMany: async ({
      data,
      where,
    }: {
      data: { lastMessageAt: Date }
      where: { id: string; organizationId: string }
    }) => {
      const row = this.conversations.find(
        (item) => item.id === where.id && item.organizationId === where.organizationId,
      )
      if (!row || (row.lastMessageAt && row.lastMessageAt >= data.lastMessageAt)) {
        return { count: 0 }
      }
      row.lastMessageAt = data.lastMessageAt
      return { count: 1 }
    },
    findFirst: async ({
      where,
    }: {
      where: {
        id: string
        organizationId: string
        OR: Array<{ userOneId?: string; userTwoId?: string }>
      }
    }) =>
      this.conversations.find(
        (item) =>
          item.id === where.id &&
          item.organizationId === where.organizationId &&
          where.OR.some(
            (condition) =>
              condition.userOneId === item.userOneId || condition.userTwoId === item.userTwoId,
          ),
      ) ?? null,
  }

  directMessage = {
    upsert: async ({
      create,
      where,
    }: {
      create: {
        body: string
        clientMessageId: string
        conversationId: string
        organizationId: string
        senderUserId: string
      }
      where: {
        conversationId_senderUserId_clientMessageId: {
          clientMessageId: string
          conversationId: string
          senderUserId: string
        }
      }
    }) => {
      const key = where.conversationId_senderUserId_clientMessageId
      const existing = this.messages.find(
        (item) =>
          item.conversationId === key.conversationId &&
          item.senderUserId === key.senderUserId &&
          item.clientMessageId === key.clientMessageId,
      )
      if (existing) return existing
      const stored = {
        ...create,
        id: `message-${this.nextId++}`,
        createdAt: new Date(`2026-09-02T08:00:0${this.messages.length}.000Z`),
        readAt: null,
      }
      this.messages.push(stored)
      return stored
    },
    findMany: async ({ where }: { where: { conversationId: string; organizationId: string } }) =>
      this.messages.filter(
        (item) =>
          item.conversationId === where.conversationId &&
          item.organizationId === where.organizationId,
      ),
  }

  userNotification = {
    upsert: async ({
      create,
      where,
    }: {
      create: Omit<NotificationRow, 'id'>
      where: {
        recipientUserId_deduplicationKey: {
          deduplicationKey: string
          recipientUserId: string
        }
      }
    }) => {
      assert.ok(this.transactionDepth > 0, 'message notification must use transaction client')
      if (this.failNotification) throw new Error('notification insert failed')
      const key = where.recipientUserId_deduplicationKey
      const existing = this.notifications.find(
        (item) =>
          item.recipientUserId === key.recipientUserId &&
          item.deduplicationKey === key.deduplicationKey,
      )
      if (existing) return existing
      const stored = { ...create, id: `notification-${this.nextId++}` }
      this.notifications.push(stored)
      return stored
    },
    create: async ({ data }: { data: Omit<NotificationRow, 'id'> }) => {
      assert.ok(this.transactionDepth > 0, 'message notification must use transaction client')
      if (this.failNotification) throw new Error('notification insert failed')
      const stored = { ...data, id: `notification-${this.nextId++}` }
      this.notifications.push(stored)
      return stored
    },
  }

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    const conversations = structuredClone(this.conversations)
    const messages = structuredClone(this.messages)
    const notifications = structuredClone(this.notifications)
    this.transactionDepth += 1
    try {
      return await callback(this)
    } catch (error) {
      this.conversations.splice(0, this.conversations.length, ...conversations)
      this.messages.splice(0, this.messages.length, ...messages)
      this.notifications.splice(0, this.notifications.length, ...notifications)
      throw error
    } finally {
      this.transactionDepth -= 1
    }
  }
}

function makeMessageUser(id: string): MessageUser {
  return { id, displayName: `用户${id.slice(-2)}`, avatarUrl: null, playerProfile: null }
}

function makeMessagingService(
  prisma: MessagingPrismaFake,
  session = makeSession(ACTOR_ID, [
    { role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM', scopeId: 'PLATFORM' },
  ]),
) {
  const auth = authStub(session)
  const social = new SocialService(prisma as unknown as PrismaService, auth)
  return new MessagingService(prisma as unknown as PrismaService, auth, social)
}

test('direct-message client key is idempotent and rejects reuse with different body', async () => {
  const prisma = new MessagingPrismaFake()
  const messaging = makeMessagingService(prisma)
  const input = { clientMessageId: 'message-key-0001', body: '你好，比赛见' }

  const first = await messaging.sendMessage('Bearer token', RECIPIENT_ID, input)
  const duplicate = await messaging.sendMessage('Bearer token', RECIPIENT_ID, input)

  assert.equal(first.message.id, duplicate.message.id)
  assert.equal(prisma.conversations.length, 1)
  assert.equal(prisma.messages.length, 1)
  assert.equal(prisma.notifications.length, 1)
  await assert.rejects(
    messaging.sendMessage('Bearer token', RECIPIENT_ID, {
      clientMessageId: input.clientMessageId,
      body: '相同编号的其他内容',
    }),
    (error: unknown) => assertHttpStatus(error, HttpStatus.CONFLICT),
  )
  assert.equal(prisma.messages.length, 1)
  assert.equal(prisma.notifications.length, 1)
})

test('direct message and notification roll back together on notification failure', async () => {
  const prisma = new MessagingPrismaFake()
  prisma.failNotification = true
  const messaging = makeMessagingService(prisma)

  await assert.rejects(
    messaging.sendMessage('Bearer token', RECIPIENT_ID, {
      clientMessageId: 'message-key-rollback',
      body: '不能留下没有通知的消息',
    }),
    /notification insert failed/,
  )
  assert.equal(prisma.conversations.length, 0)
  assert.equal(prisma.messages.length, 0)
  assert.equal(prisma.notifications.length, 0)
})

test('messaging rejects cross-organization recipients and non-participants', async () => {
  const prisma = new MessagingPrismaFake()
  prisma.memberships.set(RECIPIENT_ID, OTHER_ORGANIZATION_ID)
  const actorMessaging = makeMessagingService(prisma)

  await assert.rejects(
    actorMessaging.sendMessage('Bearer token', RECIPIENT_ID, {
      clientMessageId: 'message-key-cross-org',
      body: '这条消息不应跨组织发送',
    }),
    (error: unknown) => assertHttpStatus(error, HttpStatus.NOT_FOUND),
  )
  assert.equal(prisma.messages.length, 0)

  prisma.memberships.set(RECIPIENT_ID, ORGANIZATION_ID)
  const created = await actorMessaging.sendMessage('Bearer token', RECIPIENT_ID, {
    clientMessageId: 'message-key-private',
    body: '只对会话双方可见',
  })
  const outsiderMessaging = makeMessagingService(prisma, makeSession(THIRD_USER_ID))
  await assert.rejects(
    outsiderMessaging.listMessages('Bearer outsider', created.conversationId),
    (error: unknown) => assertHttpStatus(error, HttpStatus.NOT_FOUND),
  )
})

class ReportPrismaFake {
  reports: Array<{
    actionTaken: string | null
    clientReportId: string
    createdAt: Date
    details: string | null
    id: string
    organizationId: string
    reason: string
    reporterUserId: string
    resolution: string | null
    status: 'OPEN'
    targetId: string | null
    targetType: string
    updatedAt: Date
  }> = []
  notifications: NotificationRow[] = []
  postOrganizationId = ORGANIZATION_ID
  private nextId = 1
  private transactionDepth = 0

  post = {
    findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
      where.id === POST_ID && where.organizationId === this.postOrganizationId
        ? { id: POST_ID }
        : null,
  }

  roleAssignment = {
    findMany: async () => [{ userId: RECIPIENT_ID }],
  }

  contentReport = {
    createMany: async ({
      data,
    }: {
      data: Array<{
        clientReportId: string
        details: string | null
        organizationId: string
        reason: string
        reporterUserId: string
        targetId: string | null
        targetType: string
      }>
    }) => {
      const create = data[0]!
      const existing = this.reports.find(
        (item) =>
          item.reporterUserId === create.reporterUserId &&
          item.clientReportId === create.clientReportId,
      )
      if (existing) return { count: 0 }
      const now = new Date('2026-09-02T08:00:00.000Z')
      const stored = {
        ...create,
        id: `report-${this.nextId++}`,
        status: 'OPEN' as const,
        resolution: null,
        actionTaken: null,
        createdAt: now,
        updatedAt: now,
      }
      this.reports.push(stored)
      return { count: 1 }
    },
    findUnique: async ({
      where,
    }: {
      where: { reporterUserId_clientReportId: { clientReportId: string; reporterUserId: string } }
    }) =>
      this.reports.find(
        (item) =>
          item.reporterUserId === where.reporterUserId_clientReportId.reporterUserId &&
          item.clientReportId === where.reporterUserId_clientReportId.clientReportId,
      ) ?? null,
  }

  userNotification = {
    upsert: async ({
      create,
      where,
    }: {
      create: Omit<NotificationRow, 'id'>
      where: {
        recipientUserId_deduplicationKey: {
          deduplicationKey: string
          recipientUserId: string
        }
      }
    }) => {
      assert.ok(this.transactionDepth > 0, 'report notification must use transaction client')
      const key = where.recipientUserId_deduplicationKey
      const existing = this.notifications.find(
        (item) =>
          item.recipientUserId === key.recipientUserId &&
          item.deduplicationKey === key.deduplicationKey,
      )
      if (existing) return existing
      const stored = { ...create, id: `notification-${this.nextId++}` }
      this.notifications.push(stored)
      return stored
    },
    create: async ({ data }: { data: Omit<NotificationRow, 'id'> }) => {
      const stored = { ...data, id: `notification-${this.nextId++}` }
      this.notifications.push(stored)
      return stored
    },
  }

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    this.transactionDepth += 1
    try {
      return await callback(this)
    } finally {
      this.transactionDepth -= 1
    }
  }
}

test('report client key is idempotent, rejects changed content, and stays organization-scoped', async () => {
  const prisma = new ReportPrismaFake()
  const auth = authStub(makeSession())
  const social = new SocialService(prisma as unknown as PrismaService, auth)
  const input = {
    clientReportId: 'report-key-0001',
    targetType: 'POST' as const,
    targetId: POST_ID,
    reason: '不当内容',
    details: '请管理员核查',
  }

  const first = await social.createReport('Bearer token', input)
  const duplicate = await social.createReport('Bearer token', input)

  assert.equal(first.id, duplicate.id)
  assert.equal(prisma.reports.length, 1)
  assert.equal(prisma.notifications.length, 2)
  assert.equal(
    prisma.notifications.filter((item) => item.recipientUserId === makeSession().userId).length,
    1,
  )
  await assert.rejects(
    social.createReport('Bearer token', { ...input, reason: '相同编号的不同原因' }),
    (error: unknown) => assertHttpStatus(error, HttpStatus.CONFLICT),
  )
  assert.equal(prisma.reports.length, 1)
  assert.equal(prisma.notifications.length, 2)

  const crossOrgPrisma = new ReportPrismaFake()
  crossOrgPrisma.postOrganizationId = OTHER_ORGANIZATION_ID
  const crossOrgSocial = new SocialService(
    crossOrgPrisma as unknown as PrismaService,
    authStub(makeSession()),
  )
  await assert.rejects(
    crossOrgSocial.createReport('Bearer token', {
      ...input,
      clientReportId: 'report-key-cross-org',
    }),
    (error: unknown) => assertHttpStatus(error, HttpStatus.NOT_FOUND),
  )
  assert.equal(crossOrgPrisma.reports.length, 0)
})

class TeamReviewPrismaFake {
  userSession = { findFirst: async () => ({ id: 'active-session' }) }
  organizationMembership = { findFirst: async () => ({ id: 'active-member' }) }
  team = { findFirst: async () => ({ id: TEAM_ID }) }
  roleAssignment = {
    findMany: async () => [{ role: 'TEAM_CAPTAIN', scopeType: 'TEAM', scopeId: TEAM_ID }],
  }
  application = {
    id: APPLICATION_ID,
    organizationId: ORGANIZATION_ID,
    teamId: TEAM_ID,
    userId: RECIPIENT_ID,
    playerProfileId: null,
    requestedPosition: 'MIDFIELDER' as const,
    status: 'PENDING' as const,
    updatedAt: new Date('2026-09-02T08:00:00.000Z'),
    team: { name: '测试球队' },
    user: { id: RECIPIENT_ID },
  }
  claims = 0
  memberships = 0
  audits = 0
  notifications: NotificationRow[] = []

  teamJoinApplication = {
    findFirst: async () => ({ ...this.application }),
    updateMany: async ({ where }: { where: { status: string; updatedAt: Date } }) => {
      if (
        this.application.status !== where.status ||
        this.application.updatedAt.getTime() !== where.updatedAt.getTime()
      ) {
        return { count: 0 }
      }
      this.claims += 1
      Object.assign(this.application, {
        status: 'APPROVED' as const,
        updatedAt: new Date('2026-09-02T08:01:00.000Z'),
      })
      return { count: 1 }
    },
  }

  teamMembership = {
    findUnique: async () => null,
    upsert: async () => {
      this.memberships += 1
      return { id: 'membership-1' }
    },
  }

  auditLog = {
    create: async () => {
      this.audits += 1
      return { id: 'audit-1' }
    },
  }

  userNotification = {
    upsert: async ({
      create,
      where,
    }: {
      create: Omit<NotificationRow, 'id'>
      where: {
        recipientUserId_deduplicationKey: {
          deduplicationKey: string
          recipientUserId: string
        }
      }
    }) => {
      const key = where.recipientUserId_deduplicationKey
      const existing = this.notifications.find(
        (item) =>
          item.recipientUserId === key.recipientUserId &&
          item.deduplicationKey === key.deduplicationKey,
      )
      if (existing) return existing
      const stored = { ...create, id: 'decision-notification' }
      this.notifications.push(stored)
      return stored
    },
  }

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this)
  }
}

test('concurrent team application reviews use a compare-and-swap claim', async () => {
  const prisma = new TeamReviewPrismaFake()
  const captain = makeSession(ACTOR_ID, [
    { role: 'TEAM_CAPTAIN', scopeType: 'TEAM', scopeId: TEAM_ID },
  ])
  const social = new SocialService(prisma as unknown as PrismaService, authStub(captain))
  social.getCaptainWorkspace = async () =>
    ({
      team: null,
      members: [],
      applications: [],
    }) as never

  const decision = { decision: 'APPROVED' as const, note: '欢迎加入' }
  const results = await Promise.allSettled([
    social.reviewTeamApplication('Bearer captain', TEAM_ID, APPLICATION_ID, decision, 'req-1'),
    social.reviewTeamApplication('Bearer captain', TEAM_ID, APPLICATION_ID, decision, 'req-2'),
  ])

  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1)
  const rejected = results.find((item) => item.status === 'rejected')
  assert.ok(rejected && rejected.status === 'rejected')
  assertHttpStatus(rejected.reason, HttpStatus.CONFLICT)
  assert.equal(prisma.claims, 1)
  assert.equal(prisma.memberships, 1)
  assert.equal(prisma.audits, 1)
  assert.equal(prisma.notifications.length, 1)
})
