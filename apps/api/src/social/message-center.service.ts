import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import { Prisma } from '../generated/prisma/client'
import { defaultAvatar } from '../media/default-media'
import { blockedUserIds, lockInteractionPair } from './interaction-policy'
import { visibleNotificationTargets } from './notification-targets'
import type {
  MessageCategory,
  MessageCenterNotificationDto,
  MessagePreferencesDto,
  UpdateMessagePreferencesDto,
} from './message-center.dto'

const categorySql = Prisma.sql`CASE WHEN n.type = 'POST_LIKED' THEN 'likes' WHEN n.type IN ('POST_COMMENTED', 'COMMENT_REPLIED') THEN 'replies' ELSE 'system' END`
const groupSql = Prisma.sql`CASE WHEN n.type = 'POST_LIKED' THEN CASE WHEN n.metadata->>'commentId' IS NOT NULL THEN 'like:comment:' || (n.metadata->>'commentId') ELSE 'like:post:' || COALESCE(n.metadata->>'postId', substring(n.link_path from 'postId=([^&]+)'), n.id::text) END ELSE n.id::text END`
type NoticeRow = {
  id: string
  type: string
  deduplication_key: string | null
  group_key: string
  category: MessageCategory
  title: string
  body: string | null
  link_path: string | null
  metadata: unknown
  read_at: Date | null
  created_at: Date
}
const defaults: MessagePreferencesDto = {
  likes: 'ALL',
  replies: 'ALL',
  directMessages: true,
  systemMessages: true,
  badges: true,
  version: 0,
}

@Injectable()
export class MessageCenterService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  private async preferencesFor(session: AuthenticatedSession): Promise<MessagePreferencesDto> {
    const row = await this.prisma.userMessagePreference.findUnique({
      where: {
        organizationId_userId: { organizationId: session.organizationId, userId: session.userId },
      },
    })
    return row
      ? {
          likes: row.likes as MessagePreferencesDto['likes'],
          replies: row.replies as MessagePreferencesDto['replies'],
          directMessages: row.directMessages,
          systemMessages: row.systemMessages,
          badges: row.badges,
          version: row.version,
        }
      : { ...defaults }
  }
  async preferences(authorization?: string) {
    return this.preferencesFor(await this.auth.requireSession(authorization))
  }

  async updatePreferences(authorization: string | undefined, input: UpdateMessagePreferencesDto) {
    const session = await this.auth.requireSession(authorization)
    const { expectedVersion, ...data } = input
    await this.prisma.$transaction(async (tx) => {
      if (expectedVersion === 0) {
        const result = await tx.userMessagePreference.createMany({
          data: [{ organizationId: session.organizationId, userId: session.userId, ...data }],
          skipDuplicates: true,
        })
        if (result.count !== 1) throw conflict('消息设置已在其他页面更新，请刷新后重试')
      } else {
        const result = await tx.userMessagePreference.updateMany({
          where: {
            organizationId: session.organizationId,
            userId: session.userId,
            version: expectedVersion,
          },
          data: { ...data, version: { increment: 1 } },
        })
        if (result.count !== 1) throw conflict('消息设置已在其他页面更新，请刷新后重试')
      }
    })
    return this.preferencesFor(session)
  }

  private noticeScope(session: AuthenticatedSession) {
    return Prisma.sql`n.organization_id = ${session.organizationId}::uuid AND n.recipient_user_id = ${session.userId}::uuid AND n.type <> 'DIRECT_MESSAGE' AND (
      n.actor_user_id IS NULL OR n.type NOT IN ('POST_LIKED','POST_COMMENTED','COMMENT_REPLIED') OR NOT EXISTS (
        SELECT 1 FROM user_blocks b WHERE b.organization_id=n.organization_id AND b.blocker_user_id=${session.userId}::uuid AND b.blocked_user_id=n.actor_user_id
      ))`
  }
  private reminderSql(session: AuthenticatedSession, preferences: MessagePreferencesDto) {
    const following = Prisma.sql`EXISTS (SELECT 1 FROM app_users a JOIN user_player_follows f ON f.player_profile_id=a.player_profile_id AND f.organization_id=n.organization_id WHERE a.id=n.actor_user_id AND f.user_id=${session.userId}::uuid)`
    const audience = (value: string) =>
      value === 'ALL' ? Prisma.sql`TRUE` : value === 'FOLLOWING' ? following : Prisma.sql`FALSE`
    return Prisma.sql`CASE WHEN n.type='POST_LIKED' THEN ${audience(preferences.likes)} WHEN n.type IN ('POST_COMMENTED','COMMENT_REPLIED') THEN ${audience(preferences.replies)} ELSE ${preferences.systemMessages} END`
  }
  async summary(authorization?: string) {
    const session = await this.auth.requireSession(authorization)
    const preferences = await this.preferencesFor(session)
    const [counts, directUnreadCount] = await Promise.all([
      this.prisma.$queryRaw<Array<{ category: MessageCategory; count: number }>>(
        Prisma.sql`SELECT ${categorySql} AS category, count(*)::int AS count FROM user_notifications n WHERE ${this.noticeScope(session)} AND n.read_at IS NULL AND ${this.reminderSql(session, preferences)} GROUP BY 1`,
      ),
      this.prisma.directMessage.count({
        where: {
          organizationId: session.organizationId,
          senderUserId: { not: session.userId },
          readAt: null,
          conversation: { OR: [{ userOneId: session.userId }, { userTwoId: session.userId }] },
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
      }),
    ])
    const count = (category: MessageCategory) =>
      counts.find((row) => row.category === category)?.count ?? 0
    return {
      directUnreadCount,
      repliesUnreadCount: count('replies'),
      likesUnreadCount: count('likes'),
      systemUnreadCount: count('system'),
      badgeCount: preferences.badges && preferences.directMessages ? directUnreadCount : 0,
      hasNotificationDot: preferences.badges && counts.some((row) => row.count > 0),
      preferences,
    }
  }

  async notifications(
    authorization: string | undefined,
    category: MessageCategory,
    before?: string,
  ) {
    const session = await this.auth.requireSession(authorization)
    const [preferences, blocked] = await Promise.all([
      this.preferencesFor(session),
      blockedUserIds(this.prisma, session.organizationId, session.userId),
    ])
    const anchor = before
      ? await this.prisma.userNotification.findFirst({
          where: {
            id: before,
            organizationId: session.organizationId,
            recipientUserId: session.userId,
          },
          select: { id: true, createdAt: true },
        })
      : null
    if (before && !anchor) throw notFound('通知游标不存在')
    const after = anchor
      ? Prisma.sql`AND (created_at, id) < (${anchor.createdAt}, ${anchor.id}::uuid)`
      : Prisma.empty
    const rows = await this.prisma.$queryRaw<NoticeRow[]>(Prisma.sql`
      WITH notices AS (SELECT n.*, ${categorySql} AS category, ${groupSql} AS group_key FROM user_notifications n WHERE ${this.noticeScope(session)} AND ${categorySql}=${category}),
      ranked AS (SELECT *, row_number() OVER (PARTITION BY group_key ORDER BY created_at DESC,id DESC) AS position FROM notices)
      SELECT * FROM ranked WHERE position=1 ${after} ORDER BY created_at DESC,id DESC LIMIT 51`)
    const page = rows.slice(0, 50)
    if (!page.length) return { items: [], nextCursor: null }
    const groups = page.map((row) => row.group_key)
    const [aggregates, actors] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ group_key: string; actor_count: number; unread_count: number }>
      >(
        Prisma.sql`SELECT ${groupSql} AS group_key, count(DISTINCT n.actor_user_id)::int AS actor_count, count(*) FILTER (WHERE n.read_at IS NULL AND ${this.reminderSql(session, preferences)})::int AS unread_count FROM user_notifications n WHERE ${this.noticeScope(session)} AND ${groupSql} IN (${Prisma.join(groups)}) GROUP BY 1`,
      ),
      this.prisma.$queryRaw<
        Array<{ group_key: string; id: string; display_name: string; avatar_url: string | null }>
      >(
        Prisma.sql`WITH people AS (SELECT ${groupSql} AS group_key,n.actor_user_id, max(n.created_at) AS latest FROM user_notifications n WHERE ${this.noticeScope(session)} AND ${groupSql} IN (${Prisma.join(groups)}) AND n.actor_user_id IS NOT NULL GROUP BY 1,2), ranked AS (SELECT *,row_number() OVER (PARTITION BY group_key ORDER BY latest DESC,actor_user_id) AS position FROM people) SELECT r.group_key,a.id,a.display_name,a.avatar_url FROM ranked r JOIN app_users a ON a.id=r.actor_user_id WHERE r.position<=3 ORDER BY r.group_key,r.position`,
      ),
    ])
    const targets = await visibleNotificationTargets(
      this.prisma,
      session.organizationId,
      page.map((row) => ({
        id: row.id,
        type: row.type,
        metadata: row.metadata,
        linkPath: row.link_path,
        deduplicationKey: row.deduplication_key,
      })),
      blocked,
    )
    const items: MessageCenterNotificationDto[] = page.map((row) => {
      const aggregate = aggregates.find((item) => item.group_key === row.group_key)
      const target = targets.get(row.id) ?? null
      const unavailable = category !== 'system' && !target
      return {
        id: row.id,
        category,
        title: row.title,
        body: unavailable ? '内容已删除或暂不可访问' : row.body,
        linkPath: unavailable ? null : row.link_path,
        readAt: row.read_at?.toISOString() ?? null,
        createdAt: row.created_at.toISOString(),
        actors: actors
          .filter((actor) => actor.group_key === row.group_key)
          .map((actor) => ({
            id: actor.id,
            displayName: actor.display_name,
            avatarUrl: defaultAvatar('user', actor.id, actor.avatar_url),
          })),
        actorCount: aggregate?.actor_count ?? 0,
        unreadCount: aggregate?.unread_count ?? 0,
        target,
      }
    })
    return { items, nextCursor: rows.length > 50 ? page.at(-1)!.id : null }
  }

  async readGroup(authorization: string | undefined, id: string) {
    const session = await this.auth.requireSession(authorization)
    const keys = await this.prisma.$queryRaw<Array<{ group_key: string }>>(
      Prisma.sql`SELECT ${groupSql} AS group_key FROM user_notifications n WHERE ${this.noticeScope(session)} AND n.id=${id}::uuid`,
    )
    if (!keys[0]) throw notFound('通知不存在')
    const cutoff = new Date()
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE user_notifications n SET read_at=${cutoff} WHERE ${this.noticeScope(session)} AND ${groupSql}=${keys[0].group_key} AND n.read_at IS NULL AND n.created_at<=${cutoff}`,
    )
    return this.summary(authorization)
  }
  async readAll(authorization?: string) {
    const session = await this.auth.requireSession(authorization)
    const readAt = new Date()
    await this.prisma.$transaction([
      this.prisma.userNotification.updateMany({
        where: {
          organizationId: session.organizationId,
          recipientUserId: session.userId,
          readAt: null,
          createdAt: { lte: readAt },
        },
        data: { readAt },
      }),
      this.prisma.directMessage.updateMany({
        where: {
          organizationId: session.organizationId,
          senderUserId: { not: session.userId },
          readAt: null,
          createdAt: { lte: readAt },
          conversation: { OR: [{ userOneId: session.userId }, { userTwoId: session.userId }] },
        },
        data: { readAt },
      }),
    ])
    return this.summary(authorization)
  }
  async blocks(authorization?: string) {
    const session = await this.auth.requireSession(authorization)
    const rows = await this.prisma.userBlock.findMany({
      where: { organizationId: session.organizationId, blockerUserId: session.userId },
      include: { blocked: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return {
      items: rows.map((row) => ({
        ...row.blocked,
        avatarUrl: defaultAvatar('user', row.blocked.id, row.blocked.avatarUrl),
        createdAt: row.createdAt.toISOString(),
      })),
    }
  }
  async setBlock(
    authorization: string | undefined,
    userId: string,
    blocked: boolean,
    requestId: string = randomUUID(),
  ) {
    const session = await this.auth.requireSession(authorization)
    if (userId === session.userId) throw conflict('不能拉黑自己')
    await this.prisma.$transaction(async (tx) => {
      await lockInteractionPair(tx, session.organizationId, session.userId, userId)
      const target = await tx.organizationMembership.findFirst({
        where: { organizationId: session.organizationId, userId, status: 'ACTIVE' },
        select: { userId: true },
      })
      if (blocked && !target) throw notFound('用户不在当前组织')
      const where = {
        organizationId: session.organizationId,
        blockerUserId: session.userId,
        blockedUserId: userId,
      }
      const changed = blocked
        ? await tx.userBlock.createMany({ data: [where], skipDuplicates: true })
        : await tx.userBlock.deleteMany({ where })
      if (changed.count)
        await tx.auditLog.create({
          data: {
            organizationId: session.organizationId,
            actorType: 'USER',
            actorUserId: session.userId,
            actorRoleSnapshot: session.user.roles.map(({ role, scopeType, scopeId }) => ({
              role,
              scopeType,
              scopeId,
            })),
            action: blocked ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
            targetType: 'User',
            targetId: userId,
            reason: '用户调整自己的拉黑名单',
            source: 'API',
            requestId,
          },
        })
    })
    return { blocked }
  }
}

function notFound(message: string) {
  return new ApiHttpException(HttpStatus.NOT_FOUND, { code: ERROR_CODES.NOT_FOUND, message })
}
function conflict(message: string) {
  return new ApiHttpException(HttpStatus.CONFLICT, { code: ERROR_CODES.CONFLICT, message })
}
