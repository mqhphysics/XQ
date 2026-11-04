import Taro from '@tarojs/taro'
import type { MessageUser } from '../../features/product/product.types'
import { openNativeDetail } from '../../features/native-navigation/index.weapp'
import { readSession } from '../../features/product/session'
export async function openMessaging(request?: MessageUser | { conversationId: string }) {
  if (request) {
    await Taro.showToast({ title: '私信功能已退出', icon: 'none' })
    return
  }
  if (!readSession()) {
    await Taro.showToast({ title: '登录后可以查看通知', icon: 'none' })
    return
  }
  await openNativeDetail('/pages/messages/index')
}
export function MessagingDrawer() { return null }

