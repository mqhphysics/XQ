import { Inject, Injectable, HttpStatus } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from '../common/api-http.exception'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { PrismaService } from '../database/prisma.service'
import type { Prisma } from '../generated/prisma/client'
import type { SelfPlayerProfileDto } from './self-player-profile.dto'

const selection = {
  id: true,
  displayName: true,
  jerseyName: true,
  position: true,
  secondaryPosition: true,
  dominantFoot: true,
  heightCm: true,
  academicYear: true,
  major: true,
  hometown: true,
  bio: true,
  profileColor: true,
  ratingShooting: true,
  ratingSpeed: true,
  ratingDribbling: true,
  ratingPassing: true,
  ratingDefending: true,
  updatedAt: true,
} as const
function fail(status: HttpStatus, message: string) {
  return new ApiHttpException(status, {
    code:
      status === HttpStatus.CONFLICT
        ? ERROR_CODES.CONFLICT
        : status === HttpStatus.FORBIDDEN
          ? ERROR_CODES.FORBIDDEN
          : ERROR_CODES.BAD_REQUEST,
    message,
  })
}
@Injectable()
export class SelfPlayerProfileService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async owned(tx: Prisma.TransactionClient, actor: AuthenticatedSession) {
    const session = await tx.userSession.findFirst({
      where: {
        id: actor.sessionId,
        userId: actor.userId,
        organizationId: actor.organizationId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    })
    const user = await tx.user.findFirst({
      where: {
        id: actor.userId,
        status: 'ACTIVE',
        memberships: { some: { organizationId: actor.organizationId, status: 'ACTIVE' } },
      },
      select: { playerProfileId: true },
    })
    if (!session || !user?.playerProfileId)
      throw fail(HttpStatus.FORBIDDEN, '当前账号没有可编辑的本人球员档案')
    const player = await tx.playerProfile.findFirst({
      where: { id: user.playerProfileId, organizationId: actor.organizationId },
      select: selection,
    })
    if (!player) throw fail(HttpStatus.FORBIDDEN, '本人球员档案不可用')
    return player
  }
  async read(authorization: string | undefined) {
    const actor = await this.auth.requireSession(authorization)
    return this.prisma.$transaction((tx) => this.owned(tx, actor))
  }
  async save(
    authorization: string | undefined,
    body: SelfPlayerProfileDto,
    key: string | undefined,
    requestId: string,
  ) {
    const actor = await this.auth.requireSession(authorization)
    if (!key || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
      throw fail(HttpStatus.BAD_REQUEST, '请提供有效的 Idempotency-Key')
    const patch = Object.fromEntries(
      Object.entries(body.patch ?? {}).filter(([, value]) => value !== undefined),
    )
    if (!Object.keys(patch).length) throw fail(HttpStatus.BAD_REQUEST, '请先修改个人档案')
    const route = 'me:player:profile'
    const hash = createHash('sha256')
      .update(JSON.stringify({ organizationId: actor.organizationId, body }))
      .digest('hex')
    return this.prisma.$transaction(
      async (tx) => {
        const player = await this.owned(tx, actor)
        if (player.id !== body.playerId)
          throw fail(HttpStatus.CONFLICT, '关联的球员档案已变化，请重新打开本人资料')
        const prior = await tx.idempotencyRecord.findUnique({
          where: {
            userId_route_idempotencyKey: { userId: actor.userId, route, idempotencyKey: key },
          },
        })
        if (prior) {
          if (prior.organizationId !== actor.organizationId || prior.requestHash !== hash)
            throw fail(HttpStatus.CONFLICT, '幂等键不能用于不同资料')
          return prior.responseBody
        }
        const changed = await tx.playerProfile.updateMany({
          where: {
            id: player.id,
            organizationId: actor.organizationId,
            updatedAt: new Date(body.expectedUpdatedAt),
          },
          data: patch as Prisma.PlayerProfileUpdateManyMutationInput,
        })
        if (changed.count !== 1) throw fail(HttpStatus.CONFLICT, '档案已更新，请重新读取后修改')
        const updated = await tx.playerProfile.findFirstOrThrow({
          where: { id: player.id, organizationId: actor.organizationId },
          select: selection,
        })
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorType: 'USER',
            actorUserId: actor.userId,
            actorRoleSnapshot: actor.user.roles.map(({ role, scopeType, scopeId }) => ({
              role,
              scopeType,
              scopeId,
            })),
            action: 'SELF_PLAYER_PROFILE_UPDATED',
            targetType: 'PlayerProfile',
            targetId: player.id,
            beforeSummary: { updatedAt: player.updatedAt.toISOString() },
            afterSummary: {
              updatedAt: updated.updatedAt.toISOString(),
              fields: Object.keys(patch),
            },
            reason: '本人编辑个人球员资料',
            requestId,
            source: 'API',
          },
        })
        const response = JSON.parse(JSON.stringify(updated)) as Prisma.InputJsonValue
        await tx.idempotencyRecord.create({
          data: {
            organizationId: actor.organizationId,
            userId: actor.userId,
            route,
            idempotencyKey: key,
            requestHash: hash,
            responseBody: response,
            responseStatus: 200,
            expiresAt: new Date(Date.now() + 7 * 86400000),
          },
        })
        return updated
      },
      { isolationLevel: 'Serializable' },
    )
  }
}
