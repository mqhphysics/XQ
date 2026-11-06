import { requestNativeLogin } from '../../features/product/login-return.weapp'
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
import { ReportModal } from '../report-modal/index.weapp'
import './social.weapp.scss'
export function NativePostMenu({ post: source }: { post: PostSummary }) {
  const post = usePostInteraction(source),
    lock = useRef(false)
  const [report, setReport] = useState(false)
  const open = async () => {
    if (lock.current) return
    try {
      const action = await Taro.showActionSheet({
        itemList: [post.favoritedByMe ? '取消收藏' : '收藏', '举报'],
      })
      if (!readSession()) {
        void requestNativeLogin('登录后可以收藏和举报')
        return
      }
      if (action.tapIndex === 1) {
        setReport(true)
        return
      }
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
