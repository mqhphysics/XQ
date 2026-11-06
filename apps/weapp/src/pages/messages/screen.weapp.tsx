import { getCurrentInstance } from '@tarojs/taro'
import Notifications from './notifications.weapp'
import DirectMessages, { type NativeMessagesParams } from './direct.weapp'
export type { NativeMessagesParams } from './direct.weapp'
export default function NativeMessagesScreen(params: NativeMessagesParams = {}) {
  const route = { ...getCurrentInstance().router?.params, ...params }
  return route.notificationId ||
    (!route.conversationId && !route.userId && route.new !== '1' && route.private !== '1') ? (
    <Notifications {...params} />
  ) : (
    <DirectMessages {...params} />
  )
}
