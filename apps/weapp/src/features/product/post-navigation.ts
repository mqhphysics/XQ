import Taro from '@tarojs/taro'
import type { PostSummary } from './product.types'
export function openPost(postId: string): Promise<void> {
  return Taro.navigateTo({
    url: `/pages/post-detail/index?postId=${encodeURIComponent(postId)}`,
  }).then(() => {})
}
export function usePostInteraction(post: PostSummary): PostSummary {
  return post
}
export function updatePostInteraction(_post: PostSummary): void {}
