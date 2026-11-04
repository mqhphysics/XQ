import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { centerError } from './admin-center.policy'

export interface LocalOwnerOptions {
  enabled: boolean
  development: boolean
  organizationId: string
  ownerLoginName: string
  origin: string
}
export interface LocalOwnerRequest {
  address: string | undefined
  host: string | undefined
  origin: string | undefined
  fetchSite: string | undefined
}

/** Called by the loopback desktop server, never exposed as an anonymous API route. */
@Injectable()
export class LocalOwnerAccessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async enter(options: LocalOwnerOptions, request: LocalOwnerRequest) {
    if (!options.enabled || !options.development || process.env.NODE_ENV === 'production')
      throw centerError(403, '当前运行方式未开启本机一键管理')
    const expected = new URL(options.origin)
    if (
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.address ?? '') ||
      !['127.0.0.1', 'localhost'].includes(expected.hostname) ||
      request.host !== expected.host ||
      request.origin !== expected.origin ||
      (request.fetchSite !== undefined && request.fetchSite !== 'same-origin')
    )
      throw centerError(403, '只能从本机管理中心页面进入')

    const token = randomBytes(32).toString('base64url')
    const organizationId = options.organizationId.trim().toLowerCase()
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000)
    const now = new Date()
    await this.prisma.$transaction(
      async (tx) => {
        const users = await tx.user.findMany({
          where: {
            loginNameNormalized: options.ownerLoginName.trim().toLowerCase(),
            status: 'ACTIVE',
            memberships: {
              some: {
                organizationId,
                status: 'ACTIVE',
                organization: { status: 'ACTIVE' },
              },
            },
          },
          select: {
            id: true,
            roleAssignments: {
              where: {
                revokedAt: null,
                grantedAt: { lte: now },
                OR: [
                  {
                    organizationId,
                    role: 'ORGANIZATION_ADMIN',
                    scopeType: 'ORGANIZATION',
                    scopeId: organizationId,
                  },
                  { role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' },
                ],
              },
              select: { role: true, scopeType: true, scopeId: true },
            },
          },
          take: 2,
        })
        if (users.length !== 1 || !users[0]?.roleAssignments.length)
          throw centerError(403, '本机管理身份未配置为唯一有效的组织管理员')
        const owner = users[0]
        await tx.userSession.create({
          data: {
            userId: owner.id,
            organizationId,
            refreshTokenHash: createHash('sha256').update(token).digest('hex'),
            expiresAt,
            lastSeenAt: now,
            ipAddress:
              request.address === '::ffff:127.0.0.1' ? '127.0.0.1' : (request.address ?? null),
            userAgent: 'Xiaoqiu Local Management Center',
          },
        })
        await tx.auditLog.create({
          data: {
            organizationId,
            actorType: 'ADMIN',
            actorUserId: owner.id,
            actorRoleSnapshot: owner.roleAssignments,
            action: 'LOCAL_OWNER_SESSION_STARTED',
            targetType: 'User',
            targetId: owner.id,
            reason: '从本机单人管理入口进入',
            requestId: randomUUID(),
            source: 'LOCAL_MANAGEMENT_CENTER',
            afterSummary: { status: 'ACTIVE' },
          },
        })
      },
      { isolationLevel: 'Serializable' },
    )
    return { accessToken: token, expiresAt: expiresAt.toISOString() }
  }
}
