import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  MATCH_STATUSES,
  SCHEDULE_PLAN_STATUSES,
  SCHEDULE_REVISION_STATUSES,
  TOURNAMENT_STATUSES,
  type CompetitionRuleVersionView,
  type MatchView,
  type PublicTournamentListView,
  type SchedulePlanView,
  type ScheduleRevisionView,
  type SeasonView,
  type TeamView,
  type TournamentDetailView,
  type TournamentScheduleView,
  type TournamentView,
  type VenueView,
} from '@xiaoqiu/contracts'
import {
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator'

export class CreateSeasonDto {
  @ApiProperty({ type: String, example: '2026' })
  @IsString()
  @Length(1, 64)
  seasonCode!: string

  @ApiProperty({ type: String, example: '2026 校园杯赛季' })
  @IsString()
  @Length(1, 120)
  name!: string

  @ApiPropertyOptional({ type: String, example: '2026-09-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  startsOn?: string

  @ApiPropertyOptional({ type: String, example: '2026-12-31' })
  @IsOptional()
  @IsISO8601({ strict: true })
  endsOn?: string
}

export class CreateTournamentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  seasonId!: string

  @ApiProperty({ type: String, example: 'CAMPUS-CUP-2026' })
  @IsString()
  @Length(1, 64)
  tournamentCode!: string

  @ApiProperty({ type: String, example: '2026 校园足球杯' })
  @IsString()
  @Length(1, 160)
  name!: string
}

export class CreateCompetitionRuleVersionDto {
  @ApiProperty({ type: Number, example: 1 })
  @IsInt()
  @Min(1)
  @Max(999)
  version!: number

  @ApiProperty({ type: String, example: '首发规则' })
  @IsString()
  @Length(1, 120)
  name!: string

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  rules!: Record<string, unknown>
}

export class CreateTeamDto {
  @ApiProperty({ type: String, example: 'TEAM-A' })
  @IsString()
  @Length(1, 64)
  teamCode!: string

  @ApiProperty({ type: String, example: '数学学院' })
  @IsString()
  @Length(1, 160)
  name!: string

  @ApiPropertyOptional({ type: String, example: '数学' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  shortName?: string
}

export class CreateVenueDto {
  @ApiProperty({ type: String, example: 'FIELD-1' })
  @IsString()
  @Length(1, 64)
  venueCode!: string

  @ApiProperty({ type: String, example: '东区足球场' })
  @IsString()
  @Length(1, 160)
  name!: string

  @ApiPropertyOptional({ type: String, example: '大学城校区东区' })
  @IsOptional()
  @IsString()
  @Length(1, 240)
  address?: string
}

export class CreateMatchDto {
  @ApiProperty({ type: String, example: 'M-001' })
  @IsString()
  @Length(1, 64)
  matchCode!: string

  @ApiProperty({ type: String, example: '数学学院 vs 物理学院' })
  @IsString()
  @Length(1, 160)
  title!: string

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  homeTeamId?: string

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  awayTeamId?: string

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  venueId?: string

  @ApiPropertyOptional({ type: String, example: '2026-10-01T09:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledStartAt?: string

  @ApiPropertyOptional({ type: Number, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number
}

export class CreateSchedulePlanDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  tournamentId!: string

  @ApiProperty({ type: String, example: '小组赛首版草案' })
  @IsString()
  @Length(1, 160)
  name!: string

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  matchIds!: string[]
}

export class SeasonResponseDto implements SeasonView {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  organizationId!: string

  @ApiProperty({ type: String })
  seasonCode!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiPropertyOptional({ type: String, nullable: true })
  startsOn?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  endsOn?: string | null
}

export class TournamentResponseDto implements TournamentView {
  @ApiPropertyOptional({ type: Boolean, description: '赛事列表中是否已有发布赛程' })
  hasPublishedSchedule?: boolean
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  organizationId!: string

  @ApiProperty({ type: String, format: 'uuid' })
  seasonId!: string

  @ApiProperty({ type: String })
  tournamentCode!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, enum: TOURNAMENT_STATUSES })
  status!: TournamentView['status']
}

export class CompetitionRuleVersionResponseDto implements CompetitionRuleVersionView {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  organizationId!: string

  @ApiProperty({ type: String, format: 'uuid' })
  tournamentId!: string

  @ApiProperty({ type: Number })
  version!: number

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String })
  status!: CompetitionRuleVersionView['status']

  @ApiProperty({ type: 'object', additionalProperties: true })
  rules!: Record<string, unknown>

  @ApiProperty({ type: String, format: 'date-time' })
  publishedAt!: string
}

export class TeamResponseDto implements TeamView {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  organizationId!: string

  @ApiProperty({ type: String })
  teamCode!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiPropertyOptional({ type: String, nullable: true })
  shortName?: string | null
}

export class VenueResponseDto implements VenueView {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  organizationId!: string

  @ApiProperty({ type: String })
  venueCode!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiPropertyOptional({ type: String, nullable: true })
  address?: string | null
}

export class MatchTeamResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  teamCode!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiPropertyOptional({ type: String, nullable: true })
  shortName?: string | null
}

export class MatchVenueResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  venueCode!: string

  @ApiProperty({ type: String })
  name!: string
}

export class MatchResponseDto implements MatchView {
  @ApiPropertyOptional({
    type: Boolean,
    description: '已保存比赛录入记录；与按时间计算的比赛状态分别表示',
  })
  recorded?: boolean

  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  organizationId!: string

  @ApiProperty({ type: String, format: 'uuid' })
  tournamentId!: string

  @ApiProperty({ type: String })
  matchCode!: string

  @ApiProperty({ type: String })
  title!: string

  @ApiProperty({ type: String, enum: MATCH_STATUSES })
  status!: MatchView['status']

  @ApiPropertyOptional({ type: String, nullable: true })
  scheduledStartAt?: string | null

  @ApiPropertyOptional({ type: () => MatchTeamResponseDto, nullable: true })
  homeTeam!: MatchTeamResponseDto | null

  @ApiPropertyOptional({ type: () => MatchTeamResponseDto, nullable: true })
  awayTeam!: MatchTeamResponseDto | null

  @ApiPropertyOptional({ type: () => MatchVenueResponseDto, nullable: true })
  venue!: MatchVenueResponseDto | null
}

export class SchedulePlanResponseDto implements SchedulePlanView {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  organizationId!: string

  @ApiProperty({ type: String, format: 'uuid' })
  tournamentId!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, enum: SCHEDULE_PLAN_STATUSES })
  status!: SchedulePlanView['status']

  @ApiPropertyOptional({ type: String, nullable: true })
  publishedAt?: string | null
}

export class AdminSchedulePlanResponseDto extends SchedulePlanResponseDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  matchIds!: string[]
}

export class ScheduleRevisionResponseDto implements ScheduleRevisionView {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  organizationId!: string

  @ApiProperty({ type: String, format: 'uuid' })
  tournamentId!: string

  @ApiProperty({ type: String, format: 'uuid' })
  schedulePlanId!: string

  @ApiProperty({ type: Number })
  version!: number

  @ApiProperty({ type: String, enum: SCHEDULE_REVISION_STATUSES })
  status!: ScheduleRevisionView['status']

  @ApiProperty({ type: String, format: 'date-time' })
  publishedAt!: string
}

export class TournamentDetailResponseDto
  extends TournamentResponseDto
  implements TournamentDetailView
{
  @ApiProperty({ type: () => SeasonResponseDto })
  season!: SeasonResponseDto

  @ApiProperty({ type: () => [CompetitionRuleVersionResponseDto] })
  ruleVersions!: CompetitionRuleVersionResponseDto[]
}

export class TournamentScheduleResponseDto implements TournamentScheduleView {
  @ApiProperty({ type: () => TournamentResponseDto })
  tournament!: TournamentResponseDto

  @ApiProperty({ type: () => ScheduleRevisionResponseDto })
  revision!: ScheduleRevisionResponseDto

  @ApiProperty({ type: () => [MatchResponseDto] })
  matches!: MatchResponseDto[]
}

export class PublicTournamentListResponseDto implements PublicTournamentListView {
  @ApiProperty({ type: () => [TournamentResponseDto] })
  items!: TournamentResponseDto[]
}

export class AdminScheduleWorkbenchResponseDto {
  @ApiProperty({ type: () => [SeasonResponseDto] })
  seasons!: SeasonResponseDto[]

  @ApiProperty({ type: () => [TournamentResponseDto] })
  tournaments!: TournamentResponseDto[]

  @ApiProperty({ type: () => [CompetitionRuleVersionResponseDto] })
  ruleVersions!: CompetitionRuleVersionResponseDto[]

  @ApiProperty({ type: () => [TeamResponseDto] })
  teams!: TeamResponseDto[]

  @ApiProperty({ type: () => [VenueResponseDto] })
  venues!: VenueResponseDto[]

  @ApiProperty({ type: () => [MatchResponseDto] })
  matches!: MatchResponseDto[]

  @ApiProperty({ type: () => [AdminSchedulePlanResponseDto] })
  schedulePlans!: AdminSchedulePlanResponseDto[]
}
