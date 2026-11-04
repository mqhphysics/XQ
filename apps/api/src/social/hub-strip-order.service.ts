import { Inject, Injectable } from '@nestjs/common'
import { AuthService } from '../auth/auth.service'
import { PrismaService } from '../database/prisma.service'
import type { Prisma } from '../generated/prisma/client'
import type { UpdateHubStripOrderDto } from './social.dto'
import {
  sanitizeHubStripItems,
  sameHubStripItems,
  type HubStripItem,
} from './hub-strip-order.rules'

@Injectable()
export class HubStripOrderService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async get(authorization: string | undefined) {
    const session = await this.auth.requireSession(authorization)
    const [row, allowed] = await Promise.all([
      this.prisma.userHubStripOrder.findUnique({
        where: {
          organizationId_userId: { organizationId: session.organizationId, userId: session.userId },
        },
      }),
      this.allowedKeys(session.organizationId, session.userId),
    ])
    return {
      items: sanitizeHubStripItems(row?.items, allowed),
      version: row?.version ?? 0,
    }
  }

  async update(
    authorization: string | undefined,
    input: UpdateHubStripOrderDto,
    requestId: string,
  ) {
    const session = await this.auth.requireSession(authorization)
    const allowed = await this.allowedKeys(session.organizationId, session.userId)
    const items = sanitizeHubStripItems(input.items, allowed)
    const key = { organizationId: session.organizationId, userId: session.userId }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.userHubStripOrder.findUnique({
        where: { organizationId_userId: key },
      })
      const previous = sanitizeHubStripItems(before?.items, allowed)
      if (before && sameHubStripItems(previous, items)) {
        return { items, version: before.version }
      }
      const payload = toJson(items)
      const saved = await tx.userHubStripOrder.upsert({
        where: { organizationId_userId: key },
        create: { ...key, items: payload, version: 1 },
        update: { items: payload, version: { increment: 1 } },
      })
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorUserId: session.userId,
          actorType: 'USER',
          action: 'HUB_STRIP_ORDER_UPDATED',
          targetType: 'USER_HUB_STRIP_ORDER',
          targetId: session.userId,
          beforeSummary: toJson({ items: previous, version: before?.version ?? 0 }),
          afterSummary: toJson({ items, version: saved.version }),
          requestId,
          source: 'H5',
        },
      })
      return { items, version: saved.version }
    })
  }

  private async allowedKeys(organizationId: string, userId: string) {
    const [teams, players] = await Promise.all([
      this.prisma.userTeamPreference.findMany({
        where: { organizationId, userId },
        select: { teamId: true, isPrimary: true },
      }),
      this.prisma.userPlayerFollow.findMany({
        where: { organizationId, userId },
        select: { playerProfileId: true },
      }),
    ])
    return {
      teamIds: new Set(teams.filter((row) => !row.isPrimary).map((row) => row.teamId)),
      playerIds: new Set(players.map((row) => row.playerProfileId)),
    }
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export type { HubStripItem }
