import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'
import type { PostSummary } from '../../features/product/product.types'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import {
  updatePostInteraction,
  usePostInteraction,
} from '../../features/product/post-navigation.weapp'
import { nativeWriteEnabled } from '../../features/native-social/config.weapp'
import { openNativeComposer } from '../../features/native-social/routing.weapp'
import { ReportModal } from '../report-modal/index.weapp'
import './social.weapp.scss'

export function NativePostMenu({ post: source }: { post: PostSummary }) {
  const post = usePostInteraction(source)
  const [report, setReport] = useState(false)
  const lock = useRef(false)
  const open = async () => {
    if (lock.current) return
    try {
      const action = await Taro.showActionSheet({
        itemList: ['转发', post.favoritedByMe ? '取消收藏' : '收藏', '举报'],
      })
      if (!readSession()) {
        void Taro.showToast({ title: '登录后可以转发、收藏和举报', icon: 'none' })
        return
      }
      if (action.tapIndex === 0) {
        if (!nativeWriteEnabled('publishPosts')) {
          void Taro.showToast({ title: '发布功能暂未开放', icon: 'none' })
          return
        }
        await openNativeComposer({ tournamentId: post.tournamentId, quotePostId: post.id })
      } else if (action.tapIndex === 1) {
        lock.current = true
        const token = readSession()?.accessToken
        try {
          const value = await productRepository.setPostFavorite(post.id, !post.favoritedByMe)
          if (!token || token !== readSession()?.accessToken) return
          updatePostInteraction({ ...post, favoritedByMe: value.favorited })
          Taro.eventCenter.trigger('xiaoqiu:native-favorites-changed')
          void Taro.showToast({ title: value.favorited ? '已收藏' : '已取消收藏', icon: 'none' })
        } finally {
          lock.current = false
        }
      } else if (action.tapIndex === 2) setReport(true)
    } catch (issue) {
      const message =
        issue instanceof Error ? issue.message : (issue as { errMsg?: string })?.errMsg || ''
      if (!/cancel/i.test(message))
        void Taro.showToast({ title: message || '操作失败，请重试', icon: 'none' })
    }
  }
  return (
    <View
      className="native-post-menu"
      onClick={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <Button
        className="native-post-menu__button"
        aria-label="更多动态操作"
        onClick={() => void open()}
      >
        <Text>•••</Text>
      </Button>
      {report && (
        <ReportModal
          targetType="POST"
          targetId={post.id}
          title="举报动态"
          onClose={() => setReport(false)}
        />
      )}
    </View>
  )
}
