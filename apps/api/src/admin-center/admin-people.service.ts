import { Inject, Injectable } from '@nestjs/common'
import { isEmail, isUUID } from 'class-validator'
import { AdminCenterService } from './admin-center.service'
import { centerError, maskIdentity } from './admin-center.policy'
import type { AdminCenterEditDto, AdminCenterPageDto, AdminSanctionDto } from './admin-center.dto'
import type { Prisma } from '../generated/prisma/client'

@Injectable()
export class AdminPeopleService {
  constructor(@Inject(AdminCenterService) private readonly center: AdminCenterService) {}

  detail(auth: string | undefined, id: string) {
    return this.center.read(auth, async (tx, actor) => {
      const member = await tx.organizationMembership.findFirst({
        where: { organizationId: actor.organizationId, userId: id },
        select: {
          status: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              loginNameNormalized: true,
              displayName: true,
              realName: true,
              studentId: true,
              email: true,
              bio: true,
              avatarUrl: true,
              playerProfileId: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      })
      if (!member) throw centerError(404, '本组织中不存在该账号')
      const sessions = await tx.userSession.findMany({
        where: { organizationId: actor.organizationId, userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
          revokedAt: true,
          ipAddress: true,
          userAgent: true,
        },
      })
      await this.center.auditWrite(
        tx,
        actor,
        'USER_IDENTITY_VIEWED',
        'User',
        id,
        '管理员查看实名、学号和邮箱',
        'admin-identity-read',
        null,
        { count: 1 },
      )
      return {
        ...member.user,
        username: member.user.loginNameNormalized,
        membershipStatus: member.status,
        membershipUpdatedAt: member.updatedAt.toISOString(),
        updatedAt: member.user.updatedAt.toISOString(),
        sessions,
      }
    })
  }

  edit(
    auth: string | undefined,
    id: string,
    input: AdminCenterEditDto,
    key: string | undefined,
    requestId: string,
  ) {
    const patch: Prisma.UserUncheckedUpdateManyInput = {}
    for (const [field, value] of Object.entries(input.patch)) {
      if (
        ![
          'username',
          'displayName',
          'realName',
          'studentId',
          'email',
          'bio',
          'playerProfileId',
        ].includes(field)
      )
        throw centerError(400, `不允许修改 ${field}`)
      if (field === 'playerProfileId') {
        if (value !== null && (typeof value !== 'string' || !isUUID(value)))
          throw centerError(400, '关联球员必须使用稳定编号')
        patch.playerProfileId = value as string | null
        continue
      }
      if (value !== null && typeof value !== 'string')
        throw centerError(400, '资料字段必须为文字或空值')
      const text = typeof value === 'string' ? value.trim() : null
      const limit =
        field === 'email' ? 254 : field === 'studentId' ? 32 : field === 'bio' ? 280 : 120
      if (text && text.length > limit) throw centerError(400, `${field}长度过长`)
      if (field === 'username') {
        if (!text || !/^[A-Za-z0-9_.-]{3,32}$/.test(text))
          throw centerError(400, '用户名需为3–32位字母、数字、点、下划线或短横线')
        patch.loginNameNormalized = text.toLocaleLowerCase('zh-CN')
      } else if (field === 'displayName') {
        if (!text || text.length < 2) throw centerError(400, '昵称至少两个字')
        patch.displayName = text
      } else if (field === 'realName') {
        patch.realName = text
        patch.realNameNormalized = text?.toLocaleLowerCase('zh-CN') ?? null
      } else if (field === 'email') {
        if (text && !isEmail(text)) throw centerError(400, '邮箱格式无效')
        patch.email = text
        patch.emailNormalized = text?.toLocaleLowerCase('zh-CN') ?? null
        patch.emailVerifiedAt = null
      } else if (field === 'studentId') patch.studentId = text
      else if (field === 'bio') patch.bio = text
    }
    if (!Object.keys(patch).length) throw centerError(400, '请修改至少一个字段')
    return this.center.write(
      auth,
      `PATCH /admin/center/users/${id}`,
      input,
      key,
      async (tx, actor) => {
        const member = await tx.organizationMembership.findFirst({
          where: { organizationId: actor.organizationId, userId: id },
          select: {
            user: {
              select: {
                id: true,
                loginNameNormalized: true,
                updatedAt: true,
                studentRecordId: true,
                realName: true,
                studentId: true,
                playerProfileId: true,
              },
            },
          },
        })
        if (!member) throw centerError(404, '本组织中不存在该账号')
        if (
          member.user.studentRecordId &&
          (['realName', 'studentId', 'playerProfileId'] as const).some(
            (field) => Object.hasOwn(patch, field) && patch[field] !== member.user[field],
          )
        )
          throw centerError(409, '该用户已有学生基础档案，请在学生档案中维护姓名、学号和球员关联')
        if (
          id === actor.userId &&
          patch.loginNameNormalized &&
          patch.loginNameNormalized !== member.user.loginNameNormalized
        )
          throw centerError(403, '当前本机管理员的登录标识用于一键进入，暂不在此修改')
        const shared = await tx.organizationMembership.count({
          where: {
            userId: id,
            organizationId: { not: actor.organizationId },
            status: { not: 'LEFT' },
          },
        })
        if (
          shared &&
          !actor.user.roles.some((r) => r.role === 'PLATFORM_ADMIN' && r.scopeType === 'PLATFORM')
        )
          throw centerError(409, '该账号有其他组织身份，跨组织资料变更需平台管理员处理')
        if (patch.playerProfileId) {
          const profile = await tx.playerProfile.findFirst({
            where: { id: patch.playerProfileId as string, organizationId: actor.organizationId },
            select: { id: true },
          })
          if (!profile) throw centerError(400, '球员档案不属于当前组织')
        }
        try {
          const changed = await tx.user.updateMany({
            where: { id, updatedAt: new Date(input.expectedUpdatedAt) },
            data: patch,
          })
          if (changed.count !== 1) throw centerError(409, '资料版本已变化，请刷新后核对')
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
            throw centerError(409, '学号、邮箱或关联球员已被使用')
          throw error
        }
        await this.center.auditWrite(
          tx,
          actor,
          'USER_PROFILE_UPDATED',
          'User',
          id,
          input.reason,
          requestId,
          { changedFields: [] },
          { changedFields: Object.keys(input.patch) },
        )
        return {
          id,
          updatedAt: (
            await tx.user.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })
          ).updatedAt.toISOString(),
        }
      },
    )
  }

  editPlayerIdentity(
    auth: string | undefined,
    id: string,
    input: AdminCenterEditDto,
    key: string | undefined,
    requestId: string,
  ) {
    if (Object.keys(input.patch).some((f) => f !== 'studentId'))
      throw centerError(400, '本入口只修改球员学号')
    const value = input.patch.studentId
    if (value !== null && (typeof value !== 'string' || value.trim().length > 32))
      throw centerError(400, '学号格式无效')
    const studentId = typeof value === 'string' ? value.trim() || null : null
    return this.center.write(
      auth,
      `PATCH /admin/center/players/${id}/identity`,
      input,
      key,
      async (tx, actor) => {
        const changed = await tx.playerProfile.updateMany({
          where: {
            id,
            organizationId: actor.organizationId,
            updatedAt: new Date(input.expectedUpdatedAt),
          },
          data: { studentId, studentIdMasked: maskIdentity(studentId) },
        })
        if (changed.count !== 1) throw centerError(409, '球员资料已变化或不在当前组织')
        await this.center.auditWrite(
          tx,
          actor,
          'PLAYER_IDENTITY_UPDATED',
          'PlayerProfile',
          id,
          input.reason,
          requestId,
          null,
          { changedFields: ['studentId'] },
        )
        return {
          id,
          updatedAt: (
            await tx.playerProfile.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })
          ).updatedAt.toISOString(),
        }
      },
    )
  }

  sanction(
    auth: string | undefined,
    id: string,
    input: AdminSanctionDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.center.write(
      auth,
      `POST /admin/center/users/${id}/sanctions`,
      input,
      key,
      async (tx, actor) => {
        if (id === actor.userId) throw centerError(403, '不能冻结或封禁当前管理员自己')
        const protectedRole = await tx.roleAssignment.findFirst({
          where: {
            userId: id,
            revokedAt: null,
            OR: [
              { role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' },
              {
                organizationId: actor.organizationId,
                role: 'ORGANIZATION_ADMIN',
                scopeType: 'ORGANIZATION',
                scopeId: actor.organizationId,
              },
            ],
          },
        })
        if (protectedRole) throw centerError(403, '组织和平台管理员需通过独立权限流程处理')
        const member = await tx.organizationMembership.findFirst({
          where: { userId: id, organizationId: actor.organizationId },
        })
        if (!member) throw centerError(404, '本组织中不存在该账号')
        const status =
          input.action === 'RESTORE' ? 'ACTIVE' : input.action === 'FREEZE' ? 'SUSPENDED' : 'LEFT'
        const changed = await tx.organizationMembership.updateMany({
          where: { id: member.id, updatedAt: new Date(input.expectedUpdatedAt) },
          data: { status },
        })
        if (changed.count !== 1) throw centerError(409, '账号状态已变化，请刷新核对')
        const revoked =
          input.action === 'RESTORE'
            ? { count: 0 }
            : await tx.userSession.updateMany({
                where: { userId: id, organizationId: actor.organizationId, revokedAt: null },
                data: { revokedAt: new Date() },
              })
        await this.center.auditWrite(
          tx,
          actor,
          `USER_ACCESS_${input.action === 'BAN' ? 'BANNED' : input.action === 'FREEZE' ? 'FROZEN' : 'RESTORED'}`,
          'User',
          id,
          input.reason,
          requestId,
          { status: member.status },
          { status, revokedCount: revoked.count },
        )
        return { id, membershipStatus: status, revokedCount: revoked.count }
      },
    )
  }

  activity(auth: string | undefined, id: string, query: AdminCenterPageDto) {
    return this.center.read(auth, async (tx, actor) => {
      if (
        !(await tx.organizationMembership.findFirst({
          where: { organizationId: actor.organizationId, userId: id },
          select: { id: true },
        }))
      )
        throw centerError(404, '本组织中不存在该账号')
      const org = actor.organizationId
      const union = PrismaSql(org, id)
      const total = await tx.$queryRaw<Array<{ count: bigint }>>(union.count)
      const items = await tx.$queryRaw<
        Array<{
          id: string
          kind: string
          action: string
          occurredAt: Date
          targetType: string
          targetId: string
          summary: string | null
          source: string
        }>
      >(union.list(query.pageSize, (query.page - 1) * query.pageSize))
      return {
        items: items.map((item) => ({ ...item, occurredAt: item.occurredAt.toISOString() })),
        total: Number(total[0]?.count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
        coverage:
          '已保存的业务审计、登录会话、帖子、评论和仍存在的点赞关系；未记录的浏览/点击及取消点赞历史不补造。',
      }
    })
  }
}

import { Prisma as SQL } from '../generated/prisma/client'
function PrismaSql(org: string, id: string) {
  const sources = SQL.sql`WITH activity AS (
    SELECT id::text,'AUDIT' AS kind,action,created_at AS occurred_at,target_type,target_id,reason AS summary,'业务审计' AS source FROM audit_logs WHERE organization_id=${org}::uuid AND actor_user_id=${id}::uuid
    UNION ALL SELECT id::text||':login','SESSION','LOGIN',created_at,'UserSession',id::text,'登录会话创建','会话记录' FROM user_sessions WHERE organization_id=${org}::uuid AND user_id=${id}::uuid
    UNION ALL SELECT id::text||':logout','SESSION','SESSION_REVOKED',revoked_at,'UserSession',id::text,'该会话已撤销（不一定由用户本人发起）','会话状态' FROM user_sessions WHERE organization_id=${org}::uuid AND user_id=${id}::uuid AND revoked_at IS NOT NULL
    UNION ALL SELECT id::text,'POST','POST_CREATED',created_at,'Post',id::text,COALESCE(title,'发布帖子'),'内容记录' FROM posts WHERE organization_id=${org}::uuid AND author_user_id=${id}::uuid
    UNION ALL SELECT id::text,'COMMENT','COMMENT_CREATED',created_at,'Post',post_id::text,'发表评论','内容记录' FROM post_comments WHERE organization_id=${org}::uuid AND user_id=${id}::uuid
    UNION ALL SELECT id::text,'LIKE','CURRENT_LIKE',created_at,'Post',post_id::text,'当前仍存在的点赞关系','关系记录' FROM post_likes WHERE organization_id=${org}::uuid AND user_id=${id}::uuid
  )`
  return {
    count: SQL.sql`${sources} SELECT count(*) AS count FROM activity`,
    list: (limit: number, offset: number) =>
      SQL.sql`${sources} SELECT id,kind,action,occurred_at AS "occurredAt",target_type AS "targetType",target_id AS "targetId",summary,source FROM activity ORDER BY occurred_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}`,
  }
}
