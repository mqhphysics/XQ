import { Transform, Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  IsArray,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator'

export class AdminOverviewOrganizationDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() name!: string
}
export class AdminOverviewCountsDto {
  @ApiProperty({ minimum: 0 }) pendingStudentRegistrations!: number
  @ApiProperty({ minimum: 0 }) pendingMedia!: number
  @ApiProperty({ minimum: 0 }) pendingMessages!: number
  @ApiProperty({ minimum: 0 }) users!: number
  @ApiProperty({ minimum: 0 }) students!: number
  @ApiProperty({ minimum: 0 }) teams!: number
  @ApiProperty({ minimum: 0 }) players!: number
  @ApiProperty({ minimum: 0 }) openFeedback!: number
  @ApiProperty({ minimum: 0 }) pendingRosters!: number
  @ApiProperty({ minimum: 0 }) pendingReports!: number
  @ApiProperty({ minimum: 0 }) pendingIdentities!: number
  @ApiProperty({ minimum: 0 }) pendingPosts!: number
  @ApiProperty({ minimum: 0 }) openCorrections!: number
  @ApiProperty({ minimum: 0 }) pendingReinstatements!: number
}
export class AdminOverviewAuditDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() action!: string
  @ApiProperty() targetType!: string
  @ApiProperty({ type: String, nullable: true }) reason!: string | null
  @ApiProperty({ format: 'date-time' }) createdAt!: string
}
export class AdminOverviewResponseDto {
  @ApiProperty({ type: AdminOverviewOrganizationDto }) organization!: AdminOverviewOrganizationDto
  @ApiProperty({ type: AdminOverviewCountsDto }) counts!: AdminOverviewCountsDto
  @ApiProperty({ type: [AdminOverviewAuditDto] }) recentAudit!: AdminOverviewAuditDto[]
  @ApiProperty({ format: 'date-time' }) checkedAt!: string
}

export class AdminSystemMessageDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() recipientUserId!: string
  @ApiProperty() @IsString() @Length(2, 120) title!: string
  @ApiProperty() @IsString() @Length(2, 1000) body!: string
  @ApiProperty() @IsString() @Length(2, 500) reason!: string
}

export class AdminCenterPageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 80)
  query?: string
}

export class AdminCenterUsersQueryDto extends AdminCenterPageDto {
  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT'])
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'LEFT'
}

export class AdminCenterAuditQueryDto extends AdminCenterPageDto {
  @ApiProperty({ required: false, enum: ['IMPORTANT', 'ORDINARY', 'ALL'], default: 'IMPORTANT' })
  @IsOptional()
  @IsIn(['IMPORTANT', 'ORDINARY', 'ALL'])
  activity?: 'IMPORTANT' | 'ORDINARY' | 'ALL'

  @IsOptional()
  @IsString()
  @Length(1, 120)
  action?: string

  @IsOptional()
  @IsString()
  @Length(1, 120)
  targetType?: string
}
export class AdminCenterPostsQueryDto extends AdminCenterPageDto {
  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED', 'HIDDEN']) status?: 'DRAFT' | 'PUBLISHED' | 'HIDDEN'
}

export class AdminCenterReasonDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 500)
  reason!: string
}
export class AdminCenterCreateReasonDto {
  @ApiProperty({ required: false, description: '新增操作可不填写备注' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason: string = '新增资料'
}

export class AdminDirectMessagesQueryDto extends AdminCenterPageDto {
  @ApiProperty({ type: Number, required: false, default: 1, minimum: 1 })
  declare page: number

  @ApiProperty({ type: Number, required: false, default: 20, minimum: 1, maximum: 100 })
  declare pageSize: number

  @ApiProperty({ type: String, required: false, maxLength: 80, description: '聊天双方的昵称' })
  declare query?: string

  @ApiProperty({ type: String, required: false, enum: ['PENDING', 'APPROVED', 'HIDDEN'] })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'HIDDEN'])
  status?: 'PENDING' | 'APPROVED' | 'HIDDEN'
}

export class AdminDirectMessageDecisionDto extends AdminCenterReasonDto {
  @ApiProperty({ type: String, minLength: 2, maxLength: 500, description: '人工处理原因' })
  declare reason: string

  @ApiProperty({ type: String, enum: ['APPROVE', 'HIDE', 'RESTORE'] })
  @IsIn(['APPROVE', 'HIDE', 'RESTORE'])
  action!: 'APPROVE' | 'HIDE' | 'RESTORE'

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number
}

export class AdminRegistrationFeedbackDecisionDto extends AdminCenterReasonDto {
  @ApiProperty({ type: String, minLength: 2, maxLength: 500 })
  declare reason: string
  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number
}

export class AdminRegistrationFeedbackQueryDto extends AdminCenterPageDto {
  @ApiProperty({ type: Number, required: false, default: 1, minimum: 1 })
  declare page: number
  @ApiProperty({ type: Number, required: false, default: 20, minimum: 1, maximum: 100 })
  declare pageSize: number
}

export class AdminCenterMembershipDto extends AdminCenterReasonDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED'

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string
}

export class AdminPasswordResetDto extends AdminCenterReasonDto {
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string
}

export class AdminProvisionAccountsDto extends AdminCenterReasonDto {
  @IsInt()
  @Min(1)
  @Max(60)
  count!: number
}

export class AdminCenterEditDto extends AdminCenterReasonDto {
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string

  @IsObject()
  patch!: Record<string, unknown>
}

export class AdminCenterCreateTeamDto extends AdminCenterCreateReasonDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64)
  teamCode!: string

  @IsObject()
  profile!: Record<string, unknown>
}

export class AdminCenterCreatePlayerDto extends AdminCenterCreateReasonDto {
  @IsUUID()
  teamId!: string

  @IsObject()
  profile!: Record<string, unknown>
}

export class AdminCenterCreatePostDto extends AdminCenterCreateReasonDto {
  @IsUUID()
  tournamentId!: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 180)
  title!: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  body!: string

  @IsOptional()
  @IsIn(['PUBLISHED', 'DRAFT'])
  status?: 'PUBLISHED' | 'DRAFT'

  @IsOptional()
  @IsIn(['OFFICIAL', 'COMMUNITY'])
  type?: 'OFFICIAL' | 'COMMUNITY'

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @MaxLength(5_600_000, { each: true })
  imageDataUrls?: string[]
}

export class AdminSanctionDto extends AdminCenterReasonDto {
  @IsIn(['FREEZE', 'BAN', 'RESTORE'])
  action!: 'FREEZE' | 'BAN' | 'RESTORE'
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string
}

export class AdminContentDecisionDto {
  @ApiProperty({ required: false, description: '通过审核可不填；下架或恢复需说明原因' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason: string = ''
  @ApiProperty({enum:['APPROVE','BLOCK','RESTORE']})
  @IsIn(['APPROVE', 'BLOCK', 'RESTORE'])
  action!: 'APPROVE' | 'BLOCK' | 'RESTORE'
  @ApiProperty({type:String,format:'date-time'})
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string
}

export class AdminMediaDecisionDto extends AdminCenterReasonDto {
  @IsIn(['BLOCK', 'RESTORE'])
  action!: 'BLOCK' | 'RESTORE'
  @IsString()
  @Length(1, 512)
  url!: string
  @IsInt()
  @Min(0)
  expectedVersion!: number
}

export class AdminCenterRuleVersionDto extends AdminCenterReasonDto {
  @IsInt()
  @Min(1)
  @Max(999)
  version!: number

  @IsInt()
  @Min(0)
  @Max(999)
  expectedVersion!: number

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  name!: string

  @IsObject()
  rules!: Record<string, unknown>
}
