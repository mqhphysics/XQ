import { createHash } from 'node:crypto'
import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { AuthService } from '../auth/auth.service'
import { PrismaService } from '../database/prisma.service'
import { ApiHttpException } from '../common/api-http.exception'
import type { UpdateBadgePreferenceDto } from './social.dto'
import { badgeOptions } from './badge-preference.rules'

@Injectable()
export class BadgePreferenceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  async get(authorization: string | undefined) {
    const session = await this.auth.requireSession(authorization)
    const row = await this.prisma.userBadgePreference.findUnique({
      where: {
        organizationId_userId: { organizationId: session.organizationId, userId: session.userId },
      },
    })
    const available = badgeOptions(session.user.verificationLevel, session.user.roles)
    return {
      availableKinds: available,
      preferredKind: row?.preferredKind ?? null,
      displayedKind: available.find((kind) => kind === row?.preferredKind) ?? available[0] ?? null,
      version: row?.version ?? 0,
    }
  }
  async update(
    authorization: string | undefined,
    input: UpdateBadgePreferenceDto,
    requestId: string,
  ) {
    const session = await this.auth.requireSession(authorization)
    const available = badgeOptions(session.user.verificationLevel, session.user.roles)
    if (input.preferredKind !== null && !available.includes(input.preferredKind))
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '只能选择本人已有的有效身份标志',
      })
    const route = `badge-preference:${session.organizationId}`
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([input.preferredKind, input.version]))
      .digest('hex')
    return this.prisma.$transaction(async (tx) => {
      const whereKey = { userId: session.userId, route, idempotencyKey: input.clientActionId }
      const previous = await tx.idempotencyRecord.findUnique({
        where: { userId_route_idempotencyKey: whereKey },
      })
      if (previous) {
        if (previous.requestHash !== fingerprint) throw conflict('同一操作编号已用于其他选择')
        return previous.responseBody
      }
      const key = { organizationId: session.organizationId, userId: session.userId }
      const before = await tx.userBadgePreference.findUnique({
        where: { organizationId_userId: key },
      })
      if ((before?.version ?? 0) !== input.version) throw conflict('标志设置已变更，请刷新后重试')
      if (before) {
        const updated = await tx.userBadgePreference.updateMany({
          where: { ...key, version: input.version },
          data: { preferredKind: input.preferredKind, version: { increment: 1 } },
        })
        if (updated.count !== 1) throw conflict('标志设置已变更，请刷新后重试')
      } else {
        const created = await tx.userBadgePreference.createMany({
          data: [{ ...key, preferredKind: input.preferredKind, version: 1 }],
          skipDuplicates: true,
        })
        if (created.count !== 1) throw conflict('标志设置已变更，请刷新后重试')
      }
      const response = {
        availableKinds: available,
        preferredKind: input.preferredKind,
        displayedKind: input.preferredKind ?? available[0] ?? null,
        version: input.version + 1,
      }
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorUserId: session.userId,
          actorType: 'USER',
          action: 'PROFILE_BADGE_UPDATED',
          targetType: 'USER_BADGE_PREFERENCE',
          targetId: session.userId,
          beforeSummary: { preferredKind: before?.preferredKind ?? null, version: input.version },
          afterSummary: response,
          requestId,
          source: 'H5',
        },
      })
      await tx.idempotencyRecord.create({
        data: {
          ...whereKey,
          organizationId: session.organizationId,
          requestHash: fingerprint,
          responseStatus: 200,
          responseBody: response,
          resourceType: 'USER_BADGE_PREFERENCE',
          resourceId: session.userId,
          expiresAt: new Date(Date.now() + 86400000),
        },
      })
      return response
    })
  }
}
function conflict(message: string) {
  return new ApiHttpException(HttpStatus.CONFLICT, { code: ERROR_CODES.CONFLICT, message })
}
