import type { Prisma } from '../generated/prisma/client'

/** One published feed for an account and its associated player; SQL OR keeps each post once. */
export function identityPostWhere(
  organizationId: string,
  userId: string | null,
  playerId?: string | null,
): Prisma.PostWhereInput {
  const sources: Prisma.PostWhereInput[] = []
  if (userId) sources.push({ authorUserId: userId })
  if (playerId) sources.push({ tags: { some: { organizationId, playerId } } })
  return {
    organizationId,
    status: 'PUBLISHED',
    ...(sources.length ? { OR: sources } : { authorUserId: null }),
  }
}
