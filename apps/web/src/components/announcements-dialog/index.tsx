import type { PostSummary } from '../../features/product/product.types'

/** Mini-program: no desktop modal; callers fall back to the post detail page. */
export const ANNOUNCEMENTS_DIALOG_SUPPORTED = false

export function AnnouncementsDialog(_props: {
  announcements: PostSummary[]
  initialId: string | null
  onClose: () => void
  onOpenPost: (postId: string) => void
}) {
  return null
}
