import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator'
import { NotificationActorDto } from './social.dto'

export type ReminderAudience = 'ALL' | 'FOLLOWING' | 'NONE'
export type MessageCategory = 'replies' | 'likes' | 'system'

export class MessagePreferencesDto {
  @ApiProperty({ enum: ['ALL', 'FOLLOWING', 'NONE'] }) likes!: ReminderAudience
  @ApiProperty({ enum: ['ALL', 'FOLLOWING', 'NONE'] }) replies!: ReminderAudience
  @ApiProperty() directMessages!: boolean
  @ApiProperty() systemMessages!: boolean
  @ApiProperty() badges!: boolean
  @ApiProperty() version!: number
}
export class UpdateMessagePreferencesDto {
  @ApiProperty({ enum: ['ALL', 'FOLLOWING', 'NONE'] })
  @IsIn(['ALL', 'FOLLOWING', 'NONE'])
  likes!: ReminderAudience
  @ApiProperty({ enum: ['ALL', 'FOLLOWING', 'NONE'] })
  @IsIn(['ALL', 'FOLLOWING', 'NONE'])
  replies!: ReminderAudience
  @ApiProperty() @IsBoolean() directMessages!: boolean
  @ApiProperty() @IsBoolean() systemMessages!: boolean
  @ApiProperty() @IsBoolean() badges!: boolean
  @ApiProperty() @IsInt() @Min(0) expectedVersion!: number
}
export class MessageSummaryDto {
  @ApiProperty() directUnreadCount!: number
  @ApiProperty() repliesUnreadCount!: number
  @ApiProperty() likesUnreadCount!: number
  @ApiProperty() systemUnreadCount!: number
  @ApiProperty() badgeCount!: number
  @ApiProperty() hasNotificationDot!: boolean
  @ApiProperty({ type: () => MessagePreferencesDto }) preferences!: MessagePreferencesDto
}
export class MessageCenterQueryDto {
  @ApiProperty({ enum: ['replies', 'likes', 'system'] })
  @IsIn(['replies', 'likes', 'system'])
  category!: MessageCategory
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() before?: string
}
export class MessageNotificationTargetDto {
  @ApiProperty({ enum: ['POST', 'COMMENT'] }) kind!: 'POST' | 'COMMENT'
  @ApiProperty() postId!: string
  @ApiProperty({ type: String, nullable: true }) commentId!: string | null
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null
  @ApiProperty() excerpt!: string
}
export class MessageCenterNotificationDto {
  @ApiProperty() id!: string
  @ApiProperty({ enum: ['replies', 'likes', 'system'] }) category!: MessageCategory
  @ApiProperty() title!: string
  @ApiProperty({ type: String, nullable: true }) body!: string | null
  @ApiProperty({ type: String, nullable: true }) linkPath!: string | null
  @ApiProperty({ type: String, nullable: true }) readAt!: string | null
  @ApiProperty() createdAt!: string
  @ApiProperty({ type: () => [NotificationActorDto] }) actors!: NotificationActorDto[]
  @ApiProperty() actorCount!: number
  @ApiProperty() unreadCount!: number
  @ApiProperty({ type: () => MessageNotificationTargetDto, nullable: true })
  target!: MessageNotificationTargetDto | null
}
export class MessageCenterNotificationPageDto {
  @ApiProperty({ type: () => [MessageCenterNotificationDto] })
  items!: MessageCenterNotificationDto[]
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null
}
export class BlockedUserDto extends NotificationActorDto {
  @ApiProperty() createdAt!: string
}
export class BlockedUserListDto {
  @ApiProperty({ type: () => [BlockedUserDto] }) items!: BlockedUserDto[]
}
export class UserBlockStateDto {
  @ApiProperty() blocked!: boolean
}
export class AdminMessageNoticeDto {
  @ApiProperty() title!: string
  @ApiProperty() applicationId!: string
  @ApiProperty() deadlineAt!: string
  @ApiProperty() actionPath!: string
}

export class DirectMessagePreviewDto {
  @ApiProperty() id!: string
  @ApiProperty() body!: string
  @ApiProperty() isMine!: boolean
  @ApiProperty() createdAt!: string
  @ApiProperty({ enum: ['USER', 'ADMIN_NOTICE'] }) kind!: 'USER' | 'ADMIN_NOTICE'
  @ApiProperty({ type: () => AdminMessageNoticeDto, nullable: true })
  notice!: AdminMessageNoticeDto | null
}
export class DirectMessageItemDto extends DirectMessagePreviewDto {
  @ApiProperty() clientMessageId!: string
  @ApiProperty({ type: String, nullable: true }) readAt!: string | null
}
export class DirectConversationIdentityDto {
  @ApiProperty() id!: string
  @ApiProperty({ type: () => NotificationActorDto }) counterpart!: NotificationActorDto
  @ApiProperty() canSend!: boolean
  @ApiProperty() blocked!: boolean
}
export class DirectConversationSummaryDto extends DirectConversationIdentityDto {
  @ApiProperty({ type: String, nullable: true }) lastMessageAt!: string | null
  @ApiProperty({ type: () => DirectMessagePreviewDto, nullable: true })
  latestMessage!: DirectMessagePreviewDto | null
  @ApiProperty() unreadCount!: number
}
export class DirectConversationListDto {
  @ApiProperty() canSend!: boolean
  @ApiProperty({ type: () => [DirectConversationSummaryDto] })
  items!: DirectConversationSummaryDto[]
}
export class DirectThreadDto {
  @ApiProperty({ type: () => DirectConversationIdentityDto })
  conversation!: DirectConversationIdentityDto
  @ApiProperty({ type: () => [DirectMessageItemDto] }) items!: DirectMessageItemDto[]
}
export class DirectMessageSendResultDto {
  @ApiProperty() conversationId!: string
  @ApiProperty({ type: () => DirectMessageItemDto }) message!: DirectMessageItemDto
}
