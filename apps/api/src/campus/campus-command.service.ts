import { Inject, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { AccessPolicyService } from '../auth/access-policy.service'
import { centerError } from '../admin-center/admin-center.policy'
import { PrismaService } from '../database/prisma.service'
import { Prisma } from '../generated/prisma/client'

export type CampusTx = Prisma.TransactionClient
export const campusJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue

@Injectable()
export class CampusCommandService {
  constructor(
    @Inject(PrismaService) readonly prisma: PrismaService,
    @Inject(AuthService) readonly auth: AuthService,
    @Inject(AccessPolicyService) readonly policy: AccessPolicyService,
  ) {}

  async fresh(tx: CampusTx, actor: AuthenticatedSession, admin = false) {
    const valid = await tx.userSession.findFirst({
      where: {
        id: actor.sessionId,
        userId: actor.userId,
        organizationId: actor.organizationId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          status: 'ACTIVE',
          memberships: { some: { organizationId: actor.organizationId, status: 'ACTIVE' } },
        },
        organization: { status: 'ACTIVE' },
      },
      select: { id: true },
    })
    if (!valid) throw centerError(401, '登录或组织身份已失效')
    const roles = await tx.roleAssignment.findMany({
      where: {
        userId: actor.userId,
        revokedAt: null,
        grantedAt: { lte: new Date() },
        OR: [
          { organizationId: actor.organizationId },
          { organizationId: null, role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' },
        ],
      },
      select: { role: true, scopeType: true, scopeId: true },
    })
    const current = { ...actor, user: { ...actor.user, roles } }
    if (admin) this.policy.requireOrganizationAdministrator(current)
    return current
  }

  async read<T>(
    authorization: string | undefined,
    admin: boolean,
    run: (tx: CampusTx, actor: AuthenticatedSession) => Promise<T>,
  ) {
    const actor = await this.auth.requireSession(authorization)
    return this.prisma.$transaction(async (tx) => run(tx, await this.fresh(tx, actor, admin)), {
      isolationLevel: 'RepeatableRead',
    })
  }

  async requireUserProfileWrite(tx: CampusTx, actor: AuthenticatedSession, userId: string) {
    const shared = await tx.organizationMembership.count({
      where: { userId, organizationId: { not: actor.organizationId }, status: { not: 'LEFT' } },
    })
    if (
      shared &&
      !actor.user.roles.some(
        (role) => role.role === 'PLATFORM_ADMIN' && role.scopeType === 'PLATFORM',
      )
    )
      throw centerError(409, '该账号有其他组织身份，共用资料变更需平台管理员处理')
  }

  async write<T>(
    authorization: string | undefined,
    route: string,
    body: unknown,
    key: string | undefined,
    admin: boolean,
    run: (tx: CampusTx, actor: AuthenticatedSession) => Promise<T>,
  ): Promise<T> {
    const actor = await this.auth.requireSession(authorization)
    if (!key || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
      throw centerError(400, '请提供8–128字符的幂等键')
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ organizationId: actor.organizationId, body }))
      .digest('hex')
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const current = await this.fresh(tx, actor, admin)
            const previous = await tx.idempotencyRecord.findUnique({
              where: {
                userId_route_idempotencyKey: { userId: actor.userId, route, idempotencyKey: key },
              },
            })
            if (previous) {
              if (
                previous.organizationId !== actor.organizationId ||
                previous.requestHash !== requestHash
              )
                throw centerError(409, '幂等键对应了不同请求')
              return previous.responseBody as T
            }
            const result = await run(tx, current)
            await tx.idempotencyRecord.create({
              data: {
                organizationId: actor.organizationId,
                userId: actor.userId,
                route,
                idempotencyKey: key,
                requestHash,
                responseBody: campusJson(result),
                responseStatus: 200,
                expiresAt: new Date(Date.now() + 7 * 86400000),
              },
            })
            return result
          },
          { isolationLevel: 'Serializable', timeout: 20000 },
        )
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : null
        if (code === 'P2034' || code === 'P2002') {
          if (attempt < 2) continue
          throw centerError(409, '记录已被其他操作更新，请刷新重试')
        }
        throw error
      }
    }
    throw centerError(409, '并发操作，请重试')
  }

  audit(
    tx: CampusTx,
    actor: AuthenticatedSession,
    action: string,
    targetType: string,
    targetId: string,
    reason: string,
    requestId: string,
    before: unknown,
    after: unknown,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorType: 'USER',
        actorUserId: actor.userId,
        actorRoleSnapshot: campusJson(actor.user.roles),
        action,
        targetType,
        targetId,
        reason,
        requestId,
        source: 'CAMPUS',
        beforeSummary: campusJson(before),
        afterSummary: campusJson(after),
      },
    })
  }
}
