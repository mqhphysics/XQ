import type {
  AdminMessageNoticeDto,
  BlockedUserListDto,
  DirectThreadDto,
  MessageCenterNotificationDto,
  MessageCenterNotificationPageDto,
  MessagePreferencesDto,
  MessageSummaryDto,
  NotificationActorDto,
} from '../../../../../packages/api-client/src/generated'

export type MessagePreferences = MessagePreferencesDto
export type ReminderAudience = MessagePreferencesDto['likes']
export type MessageSummary = MessageSummaryDto
export type MessageActor = NotificationActorDto
export type MessageNotification = MessageCenterNotificationDto
export type MessageCategory = MessageCenterNotificationDto['category']
export type MessageNotificationPage = MessageCenterNotificationPageDto
export type BlockedUserList = BlockedUserListDto
export type AdministrativeNotice = AdminMessageNoticeDto
export type MessageThread = DirectThreadDto
