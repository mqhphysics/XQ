import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from '../common/api-http.exception'
import { Prisma } from '../generated/prisma/client'

type BlockReader = Pick<Prisma.TransactionClient, 'userBlock'>

export async function blockedUserIds(client: BlockReader, organizationId: string, userId?: string) {
  if (!userId) return []
  const rows = await client.userBlock.findMany({
    where: { organizationId, blockerUserId: userId },
    select: { blockedUserId: true },
  })
  return rows.map((row) => row.blockedUserId)
}

export function visiblePostWhere(blocked: string[]): Prisma.PostWhereInput {
  if (!blocked.length) return {}
  const author = { OR: [{ authorUserId: null }, { authorUserId: { notIn: blocked } }] }
  return {
    AND: [author, { OR: [{ quotedPostId: null }, { quotedPost: { is: author } }] }],
  }
}

/** Share the same lock with block/unblock so a completed block cannot race a new write. */
export async function lockInteractionPair(
  tx: Prisma.TransactionClient,
  organizationId: string,
  left: string,
  right: string,
) {
  const key = `user-interaction:${organizationId}:${[left, right].sort().join(':')}`
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
}

export async function assertInteractionAllowed(
  tx: Prisma.TransactionClient,
  organizationId: string,
  senderUserId: string,
  recipients: Array<string | null | undefined>,
) {
  const ids = [
    ...new Set(recipients.filter((id): id is string => Boolean(id && id !== senderUserId))),
  ].sort()
  for (const id of ids) await lockInteractionPair(tx, organizationId, senderUserId, id)
  if (!ids.length) return
  const block = await tx.userBlock.findFirst({
    where: {
      organizationId,
      OR: [
        { blockerUserId: senderUserId, blockedUserId: { in: ids } },
        { blockerUserId: { in: ids }, blockedUserId: senderUserId },
      ],
    },
    select: { id: true },
  })
  if (block)
    throw new ApiHttpException(HttpStatus.FORBIDDEN, {
      code: ERROR_CODES.FORBIDDEN,
      message: '已设置拉黑，无法继续发送私信或评论',
    })
}
