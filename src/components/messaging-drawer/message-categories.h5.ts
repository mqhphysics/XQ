import type { NotificationResponse } from '../../features/product/product.types'
import type { BrowserPreferences } from '../settings-dialog/preferences.h5'
export const messageCategories = [
  { id: 'messages', label: '我的消息' },
  { id: 'replies', label: '回复我的' },
  { id: 'mentions', label: '@ 我的' },
  { id: 'likes', label: '收到的赞' },
  { id: 'system', label: '系统消息' },
] as const
export type MessageCategory = (typeof messageCategories)[number]['id']
export type MessageNotification = NotificationResponse['items'][number]
export function notificationCategory(item: MessageNotification): MessageCategory {
  if (item.messageCategory === 'mentions') return 'mentions'
  if (item.type === 'DIRECT_MESSAGE') return 'messages'
  if (item.type === 'POST_LIKED') return 'likes'
  if (['POST_COMMENTED', 'COMMENT_REPLIED'].includes(item.type)) return 'replies'
  if (item.type.includes('MENTION')) return 'mentions'
  return 'system'
}
export function visibleMessageCategories(preferences: BrowserPreferences) {
  return messageCategories
    .filter((item) => item.id !== 'likes' || preferences.showLikeMessages)
    .filter((item) => item.id !== 'replies' || preferences.showReplyMessages)
    .filter((item) => item.id !== 'mentions' || preferences.showMentionMessages)
}
