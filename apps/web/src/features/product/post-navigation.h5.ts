import Taro from '@tarojs/taro'
import { useSyncExternalStore } from 'react'
import type { PostSummary } from './product.types'
import { readSession } from './session'

export const OPEN_POST_EVENT = 'xiaoqiu:open-post'
const interactions = new Map<
  string,
  Partial<
    Pick<
      PostSummary,
      | 'likedByMe'
      | 'likeCount'
      | 'commentCount'
      | 'favoritedByMe'
      | 'body'
      | 'updatedAt'
      | 'deleted'
    >
  >
>()
const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function updatePostInteraction(post: PostSummary) {
  interactions.set(`${readSession()?.user.id ?? 'guest'}:${post.id}`, {
    likedByMe: post.likedByMe,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    ...(post.favoritedByMe !== undefined ? { favoritedByMe: post.favoritedByMe } : {}),
    body: post.body,
    ...(post.updatedAt !== undefined ? { updatedAt: post.updatedAt } : {}),
    ...(post.deleted !== undefined ? { deleted: post.deleted } : {}),
  })
  for (const listener of listeners) listener()
}
export function usePostInteraction(post: PostSummary): PostSummary {
  const interaction = useSyncExternalStore(
    subscribe,
    () => interactions.get(`${readSession()?.user.id ?? 'guest'}:${post.id}`),
    () => undefined,
  )
  return interaction ? { ...post, ...interaction } : post
}
export async function openPost(postId: string): Promise<void> {
  if (window.matchMedia('(min-width: 721px)').matches) {
    window.dispatchEvent(new CustomEvent(OPEN_POST_EVENT, { detail: postId }))
    return
  }
  await Taro.navigateTo({ url: `/pages/post-detail/index?postId=${encodeURIComponent(postId)}` })
}
