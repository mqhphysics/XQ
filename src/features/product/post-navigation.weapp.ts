import { openNativeDetail } from '../native-navigation/index.weapp'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { readSession } from './session'
import { productRepository } from './product.repository'
const previews = new Map<string, PostSummary>()
const previewKey = (id: string) =>
  `${readSession()?.user.organizationId || 'public'}:${readSession()?.user.id || 'guest'}:${id}`
function rememberPreview(post: PostSummary) {
  previews.set(previewKey(post.id), post)
  if (previews.size > 80) previews.delete(previews.keys().next().value!)
}
export const readNativePostPreview = (id: string) => previews.get(previewKey(id)) || null
export const forgetNativePostPreview = (id: string) => previews.delete(previewKey(id))
import type { PostSummary } from './product.types'
export function openPost(id: string) {
  return openNativeDetail(`/pages/post-detail/index?postId=${encodeURIComponent(id)}`, () =>
    productRepository.getPost(id),
  )
}
export function usePostInteraction(post: PostSummary): PostSummary {
  const [current, setCurrent] = useState(post)
  useEffect(() => rememberPreview(current), [current])
  useEffect(() => setCurrent(post), [post])
  useEffect(() => {
    const owner = readSession()?.user.id
    const changed = (next: PostSummary, userId?: string) => {
      if (next.id === post.id && userId === owner && owner === readSession()?.user.id)
        setCurrent(next)
    }
    Taro.eventCenter.on('xiaoqiu:native-post-interaction', changed)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-post-interaction', changed)
    }
  }, [post.id])
  return current
}
export function updatePostInteraction(post: PostSummary) {
  rememberPreview(post)
  Taro.eventCenter.trigger('xiaoqiu:native-post-interaction', post, readSession()?.user.id)
}
