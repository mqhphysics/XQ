import type { Prisma } from '../generated/prisma/client'

/** Delayed publication sends the same deduplicated mentions as a directly published post. */
export async function notifyPublishedPostMentions(
  tx: Prisma.TransactionClient,
  organizationId: string,
  postId: string,
) {
  const post = await tx.post.findFirst({
    where: { id: postId, organizationId, status: 'PUBLISHED' },
    include: {
      author: { select: { id: true, displayName: true } },
      tags: { select: { playerId: true } },
    },
  })
  if (!post?.author) return
  const ids = post.tags.flatMap((tag) => (tag.playerId ? [tag.playerId] : []))
  if (!ids.length) return
  const players = await tx.playerProfile.findMany({
    where: {
      organizationId,
      id: { in: ids },
      linkedUser: {
        is: { status: 'ACTIVE', memberships: { some: { organizationId, status: 'ACTIVE' } } },
      },
    },
    select: { linkedUser: { select: { id: true } } },
  })
  for (const player of players) {
    const recipient = player.linkedUser?.id
    if (!recipient || recipient === post.author.id) continue
    if (
      await tx.userBlock.findFirst({
        where: {
          organizationId,
          OR: [
            { blockerUserId: recipient, blockedUserId: post.author.id },
            { blockerUserId: post.author.id, blockedUserId: recipient },
          ],
        },
        select: { id: true },
      })
    )
      continue
    await tx.userNotification.createMany({
      data: [
        {
          organizationId,
          recipientUserId: recipient,
          actorUserId: post.author.id,
          type: 'POST_COMMENTED',
          title: '有人在动态中提到了你',
          body: `${post.author.displayName} 在动态中提到了你`,
          linkPath: `/pages/post-detail/index?postId=${post.id}`,
          metadata: { messageCategory: 'mentions', postId: post.id, targetKind: 'POST' },
          deduplicationKey: `post-mentioned:${post.id}:${recipient}`,
        },
      ],
      skipDuplicates: true,
    })
  }
}
