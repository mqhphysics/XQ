import { ApiProperty } from '@nestjs/swagger'
import { MATCH_STATUSES } from '@xiaoqiu/contracts'

export class FocusTeamDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() teamCode!: string
  @ApiProperty() name!: string
  @ApiProperty() shortName!: string
  @ApiProperty({ type: String, nullable: true }) collegeName!: string | null
  @ApiProperty({ type: String, nullable: true }) primaryColor!: string | null
  @ApiProperty({ type: String, nullable: true }) secondaryColor!: string | null
  @ApiProperty({ type: String, nullable: true }) crestUrl!: string | null
  @ApiProperty({ type: String, nullable: true }) coverUrl!: string | null
}
export class FocusVenueDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty() name!: string
}
export class FocusMatchDto {
  @ApiProperty({ format: 'uuid' }) id!: string
  @ApiProperty({ format: 'uuid' }) tournamentId!: string
  @ApiProperty() matchCode!: string
  @ApiProperty() title!: string
  @ApiProperty({ enum: MATCH_STATUSES }) status!: (typeof MATCH_STATUSES)[number]
  @ApiProperty({ type: String, nullable: true }) scheduledStartAt!: string | null
  @ApiProperty({ type: FocusTeamDto, nullable: true }) homeTeam!: FocusTeamDto | null
  @ApiProperty({ type: FocusTeamDto, nullable: true }) awayTeam!: FocusTeamDto | null
  @ApiProperty({ type: Number, nullable: true }) homeScore!: number | null
  @ApiProperty({ type: Number, nullable: true }) awayScore!: number | null
  @ApiProperty({ type: Number, nullable: true }) homePenaltyScore!: number | null
  @ApiProperty({ type: Number, nullable: true }) awayPenaltyScore!: number | null
  @ApiProperty({ type: String, nullable: true }) statusReason!: string | null
  @ApiProperty({ type: FocusVenueDto, nullable: true }) venue!: FocusVenueDto | null
  @ApiProperty({ type: String, nullable: true }) stageName!: string | null
  @ApiProperty({ type: String, nullable: true }) stageType!: string | null
  @ApiProperty({ type: String, nullable: true }) groupName!: string | null
  @ApiProperty({ type: String, nullable: true }) roundName!: string | null
  @ApiProperty() focusGender!: string
  @ApiProperty() focusCupName!: string
}
export class FocusMatchesDto {
  @ApiProperty({ type: [FocusMatchDto] }) items!: FocusMatchDto[]
}
export class MatchInterestDto {
  @ApiProperty() accepted!: boolean
}
