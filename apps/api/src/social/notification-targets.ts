import type { Prisma } from '../generated/prisma/client'
import type { MessageCenterNotificationDto } from './message-center.dto'
import { postImageUrls, commentImageUrls } from '../media/media.service'
import { visiblePostWhere } from './interaction-policy'
export type NotificationTargetSource = {
  id: string
  type: string
  metadata: unknown
  linkPath: string | null
  deduplicationKey: string | null
}
export const isInteractionNotification = (type: string) =>
  ['POST_LIKED', 'POST_COMMENTED', 'COMMENT_REPLIED'].includes(type)
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function visibleNotificationTargets(
  client: Prisma.TransactionClient,
  organizationId: string,
  rows: NotificationTargetSource[],
  blocked: string[],
) {
  const refs = rows
    .filter((row) => isInteractionNotification(row.type))
    .map((row) => {
      const metadata =
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {}
      const postId = String(metadata.postId ?? row.linkPath?.match(/[?&]postId=([^&]+)/)?.[1] ?? '')
      const needsComment =
        ['POST_COMMENTED', 'COMMENT_REPLIED'].includes(row.type) &&
        metadata.messageCategory !== 'mentions'
      const commentId =
        typeof metadata.commentId === 'string'
          ? metadata.commentId
          : needsComment
            ? (row.deduplicationKey?.match(/^post-comment:([0-9a-f-]+)$/i)?.[1] ?? null)
            : null
      return { id: row.id, postId, commentId, needsComment }
    })
    .filter(
      (ref) =>
        uuid.test(ref.postId) &&
        (!ref.needsComment || (!!ref.commentId && uuid.test(ref.commentId))),
    )
  if (!refs.length) return new Map<string, MessageCenterNotificationDto['target']>()
  const ids = [...new Set(refs.map((ref) => ref.postId))]
  const commentIds = refs.flatMap((ref) =>
    ref.commentId && uuid.test(ref.commentId) ? [ref.commentId] : [],
  )
  const [posts, comments] = await Promise.all([
    client.post.findMany({
      where: {
        id: { in: ids },
        organizationId,
        status: 'PUBLISHED',
        ...visiblePostWhere(blocked),
      },
      select: { id: true, body: true, imageUrl: true },
    }),
    client.postComment.findMany({
      where: {
        id: { in: commentIds },
        organizationId,
        hiddenAt: null,
        ...(blocked.length ? { userId: { notIn: blocked } } : {}),
      },
      select: { id: true, postId: true, body: true, imageUrl: true },
    }),
  ])
  const result = new Map<string, MessageCenterNotificationDto['target']>()
  for (const ref of refs) {
    const post = posts.find((item) => item.id === ref.postId)
    if (!post) continue
    const comment = ref.commentId
      ? comments.find((item) => item.id === ref.commentId && item.postId === post.id)
      : null
    if (ref.commentId && !comment) continue
    result.set(ref.id, {
      kind: comment ? 'COMMENT' : 'POST',
      postId: post.id,
      commentId: comment?.id ?? null,
      imageUrl:
        (comment
          ? commentImageUrls(comment.id, comment.imageUrl)
          : postImageUrls(post.imageUrl))[0] ?? null,
      excerpt: (comment?.body ?? post.body).slice(0, 120),
    })
  }
  return result
}
