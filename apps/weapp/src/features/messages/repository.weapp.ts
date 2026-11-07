import { request } from '../product/product.repository'
import type {
  BlockedUserList,
  MessageCategory,
  MessageNotificationPage,
  MessagePreferences,
  MessageSummary,
  MessageThread,
} from './types'

export const messageRepository = {
  readConversation: (id: string) =>
    request<MessageThread>(`/messages/conversations/${encodeURIComponent(id)}/read`, {
      method: 'PUT',
    }),
  summary: () => request<MessageSummary>('/me/message-center/summary', { refresh: true }),
  notifications: (category: MessageCategory, before?: string | null) =>
    request<MessageNotificationPage>(
      `/me/message-center/notifications?category=${category}${before ? `&before=${encodeURIComponent(before)}` : ''}`,
      { refresh: true },
    ),
  readGroup: (id: string) =>
    request<MessageSummary>(`/me/message-center/groups/${encodeURIComponent(id)}/read`, {
      method: 'PUT',
    }),
  readAll: () => request<MessageSummary>('/me/message-center/read-all', { method: 'PUT' }),
  preferences: () => request<MessagePreferences>('/me/message-preferences', { refresh: true }),
  savePreferences: (preferences: MessagePreferences) =>
    request<MessagePreferences>('/me/message-preferences', {
      method: 'PUT',
      data: {
        likes: preferences.likes,
        replies: preferences.replies,
        directMessages: preferences.directMessages,
        systemMessages: preferences.systemMessages,
        badges: preferences.badges,
        expectedVersion: preferences.version,
      },
    }),
  blockedUsers: () => request<BlockedUserList>('/me/blocked-users', { refresh: true }),
  block: (id: string) =>
    request<{ blocked: boolean }>(`/me/blocked-users/${encodeURIComponent(id)}`, { method: 'PUT' }),
  unblock: (id: string) =>
    request<{ blocked: boolean }>(`/me/blocked-users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
}
