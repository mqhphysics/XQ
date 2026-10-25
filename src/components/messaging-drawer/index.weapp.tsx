import Taro from '@tarojs/taro'
import type { MessageUser } from '../../features/product/product.types'
import { openNativeDetail } from '../../features/native-navigation/index.weapp'
import { readSession } from '../../features/product/session'

const targets = new Map<string, MessageUser>()
const targetKey = (id: string) =>
  `${readSession()?.user.organizationId}:${readSession()?.user.id}:${id}`
export const nativeMessageTarget = (id: string) => targets.get(targetKey(id)) ?? null
export async function openMessaging(request?: MessageUser | { conversationId: string }) {
  const user = readSession()?.user
  if (!user) {
    await Taro.showToast({ title: '登录后可以查看消息', icon: 'none' })
    return
  }
  if (request && 'id' in request && request.id === user.id) {
    await Taro.showToast({ title: '这是你自己的账号', icon: 'none' })
    return
  }
  let query = ''
  if (request && 'conversationId' in request)
    query = `?conversationId=${encodeURIComponent(request.conversationId)}`
  else if (request) {
    targets.set(targetKey(request.id), request)
    query = `?userId=${encodeURIComponent(request.id)}`
  }
  await openNativeDetail(`/pages/messages/index${query}`)
}
/** Messages now have a full-screen route; retained as a no-op for the shared shell slot. */
export function MessagingDrawer() {
  return null
}
