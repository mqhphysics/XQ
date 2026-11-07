import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'

export const REPORT_ACTIONS = [
  'SAVE',
  'SUBMIT',
  'RETURN',
  'CONFIRM',
  'CORRECT',
  'COMPLETE',
  'SAVE_SCORE',
] as const
export type ReportAction = (typeof REPORT_ACTIONS)[number]
export const EVENT_KINDS = ['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION'] as const

export class ReportEventDto {
  @ApiProperty({ description: '客户端事件稳定标识，确认投影时另外生成服务器 UUID' })
  @IsString()
  @Length(1, 120)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  clientEventId!: string

  @ApiProperty({ enum: EVENT_KINDS })
  @IsIn(EVENT_KINDS)
  kind!: (typeof EVENT_KINDS)[number]

  @ApiProperty({ enum: ['HOME', 'AWAY'] })
  @IsIn(['HOME', 'AWAY'])
  side!: 'HOME' | 'AWAY'

  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^$|^\d{1,3}$/)
  minute!: string

  @ApiProperty({ type: String, description: '空字符串表示没有补时' })
  @IsString()
  @Matches(/^$|^\d{1,2}$/)
  addedMinute!: string

  @ApiProperty({ format: 'uuid' })
  @IsString()
  @ValidateIf((_object, value) => value !== '')
  @IsUUID()
  playerId!: string

  @ApiProperty({ type: String, description: '助攻或换上球员 ID；没有时为空字符串' })
  @IsString()
  @ValidateIf((_object, value) => value !== '')
  @IsUUID()
  relatedPlayerId!: string
}

export class ReportFieldsDto {
  @ApiProperty({ type: String, description: '普通比赛比分，点球大战单独填写' })
  @IsString()
  @Matches(/^\d{1,2}$/)
  homeScore!: string
  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^\d{1,2}$/)
  awayScore!: string
  @ApiProperty({ type: String, description: '没有点球大战时为空字符串' })
  @IsString()
  @Matches(/^$|^\d{1,2}$/)
  homePenaltyScore!: string
  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^$|^\d{1,2}$/)
  awayPenaltyScore!: string
  @ApiProperty({ enum: ['FINISHED', 'HOME_FORFEIT', 'AWAY_FORFEIT', 'ABANDONED'] })
  @IsIn(['FINISHED', 'HOME_FORFEIT', 'AWAY_FORFEIT', 'ABANDONED'])
  outcome!: 'FINISHED' | 'HOME_FORFEIT' | 'AWAY_FORFEIT' | 'ABANDONED'
  @ApiProperty({ type: [ReportEventDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReportEventDto)
  events!: ReportEventDto[]
  @ApiProperty({ type: String, maxLength: 800 })
  @IsString()
  @Length(0, 800)
  notes!: string
}

export class WriteMatchReportDto {
  @ApiPropertyOptional({ format: 'uuid', description: '详情内编辑的开始凭据' })
  @IsOptional()
  @IsUUID()
  editorToken?: string
  @ApiProperty({ type: String, description: '同一保存及网络重试始终使用同一个键' })
  @IsString()
  @Length(8, 120)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  clientActionId!: string
  @ApiProperty({ type: Number, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number
  @ApiProperty({ enum: REPORT_ACTIONS })
  @IsIn(REPORT_ACTIONS)
  action!: ReportAction
  @ApiProperty({ type: String, maxLength: 240 })
  @IsString()
  @Length(0, 240)
  reason!: string
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'SAVE/SUBMIT/CORRECT 必须绑定名单及规程版本；审核动作只复制已有快照',
  })
  @IsOptional()
  @IsUUID()
  homeRosterSnapshotId?: string
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  awayRosterSnapshotId?: string
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ruleVersionId?: string
  @ApiPropertyOptional({ type: ReportFieldsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReportFieldsDto)
  fields?: ReportFieldsDto
}

export class BeginMatchReportDto {
  @ApiProperty()
  @IsString()
  @Length(8, 120)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  clientActionId!: string
}

export class RequestMatchReportChangeDto extends BeginMatchReportDto {
  @ApiProperty({ maxLength: 240 })
  @IsString()
  @Length(2, 240)
  reason!: string
}

export class ReportHistoryQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  beforeVersion?: number
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

export class ReportPlayerViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() displayName!: string
  @ApiProperty({ type: String, nullable: true }) shirtNumber!: string | null
}
export class ReportTeamViewDto {
  @ApiProperty({ type: String }) id!: string
  @ApiProperty() name!: string
  @ApiProperty({ type: String, nullable: true }) rosterSnapshotId!: string | null
  @ApiProperty({ type: [ReportPlayerViewDto] }) players!: ReportPlayerViewDto[]
}
export class ReportPermissionsDto {
  @ApiProperty() isAdministrator!: boolean
  @ApiProperty() canRecordTechnical!: boolean
  @ApiProperty({ description: '具备直接发布比赛记录的管理员权限，不受当前是否待审核影响' })
  canPublish!: boolean
  @ApiProperty() canEdit!: boolean
  @ApiProperty() canSubmit!: boolean
  @ApiProperty() canViewHistory!: boolean
  @ApiProperty() canCorrect!: boolean
  @ApiProperty() canConfirm!: boolean
  @ApiProperty() canReturn!: boolean
}
export class ReportRecordingWindowDto {
  @ApiProperty() serverNow!: string
  @ApiProperty({ type: String, nullable: true }) opensAt!: string | null
  @ApiProperty({ type: String, nullable: true }) estimatedEndAt!: string | null
  @ApiProperty({ type: String, nullable: true }) endedAt!: string | null
  @ApiProperty({ type: String, nullable: true, enum: ['ACTUAL', 'ESTIMATED'] }) endedAtSource!:
    | 'ACTUAL'
    | 'ESTIMATED'
    | null
  @ApiProperty({ type: String, nullable: true }) technicalClosesAt!: string | null
  @ApiProperty({ type: String, nullable: true }) reportCompletedAt!: string | null
}
export class ReportRevisionViewDto {
  @ApiProperty() version!: number
  @ApiProperty({ type: String, format: 'date-time' }) savedAt!: string
  @ApiProperty() savedBy!: string
  @ApiProperty({ enum: ['DRAFT', 'SUBMITTED', 'RETURNED', 'CONFIRMED'] }) status!: string
  @ApiProperty({ enum: REPORT_ACTIONS }) action!: ReportAction
  @ApiProperty() reason!: string
  @ApiProperty({ type: ReportFieldsDto }) fields!: ReportFieldsDto
  @ApiProperty({ format: 'uuid' }) homeRosterSnapshotId!: string
  @ApiProperty({ format: 'uuid' }) awayRosterSnapshotId!: string
  @ApiProperty({ format: 'uuid' }) ruleVersionId!: string
  @ApiPropertyOptional({ type: [ReportPlayerViewDto] }) homePlayers?: ReportPlayerViewDto[]
  @ApiPropertyOptional({ type: [ReportPlayerViewDto] }) awayPlayers?: ReportPlayerViewDto[]
}
export class OfficialReportResultDto {
  @ApiProperty({ type: Number, nullable: true }) homeScore!: number | null
  @ApiProperty({ type: Number, nullable: true }) awayScore!: number | null
  @ApiProperty({ type: Number, nullable: true }) homePenaltyScore!: number | null
  @ApiProperty({ type: Number, nullable: true }) awayPenaltyScore!: number | null
  @ApiProperty() status!: string
}
export class ReportWorkspaceResponseDto {
  @ApiProperty({ type: Object, description: '本场详情编辑的真实权限和完成状态' })
  inline!: { editor: boolean; canStart: boolean; completed: boolean; changeRequested: boolean }
  @ApiPropertyOptional({ format: 'uuid' }) editorToken?: string
  @ApiPropertyOptional({ type: Object }) completion?: { published: boolean; retained: boolean }
  @ApiProperty({ format: 'uuid' }) organizationId!: string
  @ApiProperty({ format: 'uuid' }) matchId!: string
  @ApiProperty() title!: string
  @ApiProperty({ type: String, nullable: true }) ruleVersionId!: string | null
  @ApiProperty() isKnockout!: boolean
  @ApiProperty() reportVersion!: number
  @ApiProperty({ type: Number, nullable: true }) confirmedReportVersion!: number | null
  @ApiPropertyOptional() savedVersion?: number
  @ApiProperty({ type: ReportTeamViewDto }) homeTeam!: ReportTeamViewDto
  @ApiProperty({ type: ReportTeamViewDto }) awayTeam!: ReportTeamViewDto
  @ApiProperty({ type: ReportPermissionsDto }) permissions!: ReportPermissionsDto
  @ApiProperty({ type: ReportRecordingWindowDto }) recordingWindow!: ReportRecordingWindowDto
  @ApiProperty({ type: ReportRevisionViewDto, nullable: true })
  latest!: ReportRevisionViewDto | null
  @ApiProperty({ type: String, nullable: true }) reviewNote!: string | null
  @ApiPropertyOptional({ type: [String] }) blockingReasons?: string[]
  @ApiProperty({ type: OfficialReportResultDto }) officialResult!: OfficialReportResultDto
}
export class ReportHistoryResponseDto {
  @ApiProperty({ type: [ReportRevisionViewDto] }) items!: ReportRevisionViewDto[]
  @ApiProperty({ type: Number, nullable: true }) nextBeforeVersion!: number | null
}
export class ReportOverviewItemDto {
  @ApiProperty({ format: 'uuid' }) matchId!: string
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['DRAFT', 'SUBMITTED', 'RETURNED', 'CONFIRMED'],
  })
  reportStatus!: string | null
  @ApiProperty() reportVersion!: number
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) reportedAt!: string | null
  @ApiProperty({ type: Number, nullable: true }) homeScore!: number | null
  @ApiProperty({ type: Number, nullable: true }) awayScore!: number | null
  @ApiProperty({ description: '比分与进球事件、球员、时间对应完整；助攻选填' }) recorded!: boolean
}
export class ReportOverviewResponseDto {
  @ApiProperty({ enum: [1] }) completionRuleVersion!: 1
  @ApiProperty({ type: [ReportOverviewItemDto] }) items!: ReportOverviewItemDto[]
}
