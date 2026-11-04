import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from '../common/api-http.exception'
import type { Prisma } from '../generated/prisma/client'

/** A team has at most two active captains; the database trigger enforces the same limit. */
export const MAX_TEAM_CAPTAINS = 2

export const CAPTAIN_LIMIT_MESSAGE = `每支球队最多 ${MAX_TEAM_CAPTAINS} 名队长，请先撤销一名现任队长`

/**
 * Throws 409 when granting TEAM_CAPTAIN on `teamId` to `userId` would exceed the limit.
 * Re-granting a captain who already holds the role is never counted twice.
 */
export async function assertCaptainCapacity(
  tx: Prisma.TransactionClient,
  organizationId: string,
  teamId: string,
  userId: string,
): Promise<void> {
  // Serialize concurrent grants for the same team inside this transaction.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team-captains:${teamId.toLowerCase()}`}))`
  const others = await tx.roleAssignment.count({
    where: {
      organizationId,
      role: 'TEAM_CAPTAIN',
      scopeType: 'TEAM',
      scopeId: teamId,
      revokedAt: null,
      userId: { not: userId },
    },
  })
  if (others >= MAX_TEAM_CAPTAINS)
    throw new ApiHttpException(HttpStatus.CONFLICT, {
      code: ERROR_CODES.CONFLICT,
      message: CAPTAIN_LIMIT_MESSAGE,
    })
}
