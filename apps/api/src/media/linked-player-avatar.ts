import type { Prisma } from '../generated/prisma/client'

/** Keep inherited player avatars current while preserving independently uploaded player photos. */
export async function syncLinkedPlayerAvatar(
  tx: Pick<Prisma.TransactionClient, 'user' | 'playerProfile'>,
  organizationId: string,
  userId: string,
  previousUrl: string | null,
  nextUrl: string | null,
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      playerProfileId: true,
      showPlayerIdentity: true,
      status: true,
      memberships: { where: { organizationId, status: 'ACTIVE' }, select: { id: true } },
    },
  })
  if (
    !user?.playerProfileId ||
    user.status !== 'ACTIVE' ||
    !user.showPlayerIdentity ||
    !user.memberships.length
  )
    return
  const profile = await tx.playerProfile.findFirst({
    where: { id: user.playerProfileId, organizationId },
    select: { id: true, avatarUrl: true },
  })
  if (!profile) return
  const inherited =
    !profile.avatarUrl ||
    profile.avatarUrl === previousUrl ||
    /^\/api\/media\/defaults\/(?:player|user)-avatar-\d{2}-v\d+\.webp$/.test(profile.avatarUrl)
  if (inherited)
    await tx.playerProfile.updateMany({
      where: { id: profile.id, organizationId, avatarUrl: profile.avatarUrl },
      data: { avatarUrl: nextUrl },
    })
}
