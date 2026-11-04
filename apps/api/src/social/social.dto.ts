import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  Min,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator'
import { BADGE_KINDS, type BadgeKind } from './badge-preference.rules'
import { HUB_STRIP_KINDS, HUB_STRIP_MAX_ITEMS } from './hub-strip-order.rules'

export class UpdateBadgePreferenceDto {
  @ApiProperty({ nullable: true, enum: BADGE_KINDS })
  @IsIn([...BADGE_KINDS, null])
  preferredKind!: BadgeKind | null
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  version!: number
  @ApiProperty({ type: String })
  @IsString()
  @Length(8, 120)
  clientActionId!: string
}

export class HubStripOrderItemDto {
  @ApiProperty({ enum: HUB_STRIP_KINDS })
  @IsIn([...HUB_STRIP_KINDS])
  kind!: (typeof HUB_STRIP_KINDS)[number]

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  id!: string
}

export class UpdateHubStripOrderDto {
  @ApiProperty({ type: [HubStripOrderItemDto] })
  @IsArray()
  @ArrayMaxSize(HUB_STRIP_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => HubStripOrderItemDto)
  items!: HubStripOrderItemDto[]
}

const POSITIONS = ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD'] as const

export class CreateTeamApplicationDto {
  @ApiPropertyOptional({ type: String, enum: POSITIONS })
  @IsOptional()
  @IsIn(POSITIONS)
  requestedPosition?: (typeof POSITIONS)[number]

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 500)
  message?: string
}

export class ReviewTeamApplicationDto {
  @ApiProperty({ type: String, enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED'

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string
}

export class TeamManagementCommandDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  expectedUpdatedAt?: string

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(2, 500)
  reason?: string
}

export class UpdateTeamProfileDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string

  @ApiProperty({ type: String, maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 500)
  reason!: string

  @ApiProperty({ type: Object })
  @IsObject()
  patch!: Record<string, unknown>
}

export class UpdateTeamMemberDto extends TeamManagementCommandDto {
  @ApiProperty({ type: String, enum: POSITIONS })
  @IsIn(POSITIONS)
  position!: (typeof POSITIONS)[number]
}

export class CreateReportDto {
  @ApiProperty({ type: String, description: '客户端生成的投诉/反馈幂等键' })
  @IsString()
  @Length(8, 120)
  clientReportId!: string

  @ApiProperty({
    type: String,
    enum: ['POST', 'COMMENT', 'MATCH_REVIEW', 'DIRECT_MESSAGE', 'USER', 'FEEDBACK'],
  })
  @IsIn(['POST', 'COMMENT', 'MATCH_REVIEW', 'DIRECT_MESSAGE', 'USER', 'FEEDBACK'])
  targetType!: 'POST' | 'COMMENT' | 'MATCH_REVIEW' | 'DIRECT_MESSAGE' | 'USER' | 'FEEDBACK'

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetId?: string

  @ApiProperty({ type: String, maxLength: 120 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  reason!: string

  @ApiPropertyOptional({ type: String, maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  details?: string
}

export class ReviewReportDto {
  @ApiProperty({ type: String, enum: ['IN_REVIEW', 'RESOLVED', 'REJECTED'] })
  @IsIn(['IN_REVIEW', 'RESOLVED', 'REJECTED'])
  status!: 'IN_REVIEW' | 'RESOLVED' | 'REJECTED'

  @ApiProperty({ type: String, maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 1000)
  resolution!: string

  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsBoolean()
  hideContent?: boolean
}

export class CreateDirectMessageDto {
  @ApiProperty({ type: String, maxLength: 2000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  body!: string

  @ApiProperty({ type: String, description: '客户端生成的单次发送幂等键' })
  @IsString()
  @Length(8, 120)
  clientMessageId!: string
}
