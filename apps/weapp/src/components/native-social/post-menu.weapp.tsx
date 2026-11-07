import { blockNativeUser } from '../../features/native-social/blocking.weapp'
import { requestNativeLogin } from '../../features/product/login-return.weapp'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'
import type { PostSummary } from '../../features/product/product.types'
import { readSession } from '../../features/product/session'
import { usePostInteraction } from '../../features/product/post-navigation.weapp'
import { ReportModal } from '../report-modal/index.weapp'
export function NativePostMenu({ post: source }: { post: PostSummary }) {
  const post = usePostInteraction(source),
    lock = useRef(false)
  const [report, setReport] = useState(false)
  const open = async () => {
    if (lock.current) return
    try {
      const action = await Taro.showActionSheet({
        itemList: post.author.id === readSession()?.user.id ? ['举报'] : ['举报', '拉黑'],
      })
      if (!readSession()) {
        void requestNativeLogin('登录后可以举报或管理屏蔽')
        return
      }
      if (action.tapIndex === 0) {
        setReport(true)
        return
      }
      lock.current = true
      try {
        await blockNativeUser(post.author.id, post.author.displayName)
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
