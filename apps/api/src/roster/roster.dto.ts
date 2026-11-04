import { ApiProperty } from '@nestjs/swagger'
import {
  DATA_QUALITY_STATUSES,
  ROSTER_SUBMISSION_STATUSES,
  TEAM_REGISTRATION_STATUSES,
  type AdminRosterPlayerView,
  type AdminTeamRegistrationDetailView,
  type AdminTeamRegistrationListItemView,
  type AdminTeamRegistrationListView,
  type PublicRosterPlayerView,
  type PublicTournamentTeamDetailView,
  type PublicTournamentTeamListItemView,
  type PublicTournamentTeamListView,
} from '@xiaoqiu/contracts'

export class PublicTournamentTeamListItemResponseDto implements PublicTournamentTeamListItemView {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String, format: 'uuid' })
  tournamentId!: string

  @ApiProperty({ type: String })
  teamCode!: string

  @ApiProperty({ type: String })
  name!: string

  @ApiProperty({ type: String, nullable: true })
  shortName!: string | null

  @ApiProperty({ type: String, enum: TEAM_REGISTRATION_STATUSES })
  registrationStatus!: PublicTournamentTeamListItemView['registrationStatus']

  @ApiProperty({ type: String, enum: ROSTER_SUBMISSION_STATUSES })
  rosterStatus!: PublicTournamentTeamListItemView['rosterStatus']

  @ApiProperty({ type: Number, minimum: 0 })
  rosterPlayerCount!: number
}

export class PublicTournamentTeamListResponseDto implements PublicTournamentTeamListView {
  @ApiProperty({ type: () => [PublicTournamentTeamListItemResponseDto] })
  items!: PublicTournamentTeamListItemResponseDto[]
}

export class PublicRosterPlayerResponseDto implements PublicRosterPlayerView {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string

  @ApiProperty({ type: String })
  displayName!: string

  @ApiProperty({ type: String, nullable: true })
  shirtNumber!: string | null
}

export class PublicTournamentTeamDetailResponseDto
  extends PublicTournamentTeamListItemResponseDto
  implements PublicTournamentTeamDetailView
{
  @ApiProperty({ type: String, nullable: true })
  leaderDisplayName!: string | null

  @ApiProperty({ type: String, nullable: true })
  coachDisplayName!: string | null

  @ApiProperty({ type: Number, minimum: 1 })
  rosterSnapshotVersion!: number

  @ApiProperty({ type: () => [PublicRosterPlayerResponseDto] })
  players!: PublicRosterPlayerResponseDto[]
}

export class AdminTeamRegistrationListItemResponseDto implements AdminTeamRegistrationListItemView {
  @ApiProperty({ type: String, format: 'uuid' })
  registrationId!: string

  @ApiProperty({ type: String, format: 'uuid' })
  teamId!: string

  @ApiProperty({ type: String })
  teamCode!: string

  @ApiProperty({ type: String })
  teamName!: string

  @ApiProperty({ type: String, enum: TEAM_REGISTRATION_STATUSES })
  registrationStatus!: AdminTeamRegistrationListItemView['registrationStatus']

  @ApiProperty({ type: String, enum: ROSTER_SUBMISSION_STATUSES, nullable: true })
  rosterStatus!: AdminTeamRegistrationListItemView['rosterStatus']

  @ApiProperty({ type: Number, minimum: 1, nullable: true })
  rosterSubmissionVersion!: number | null

  @ApiProperty({ type: Number, minimum: 1, nullable: true })
  rosterSnapshotVersion!: number | null

  @ApiProperty({ type: Number, minimum: 0 })
  playerCount!: number

  @ApiProperty({ type: String, enum: DATA_QUALITY_STATUSES, nullable: true })
  dataQualityStatus!: AdminTeamRegistrationListItemView['dataQualityStatus']

  @ApiProperty({ type: [String] })
  warningCodes!: string[]

  @ApiProperty({ type: String, nullable: true })
  contactName!: string | null

  @ApiProperty({ type: String, nullable: true, example: '138****0000' })
  contactPhoneMasked!: string | null
}

export class AdminTeamRegistrationListResponseDto implements AdminTeamRegistrationListView {
  @ApiProperty({ type: () => [AdminTeamRegistrationListItemResponseDto] })
  items!: AdminTeamRegistrationListItemResponseDto[]
}

export class AdminRosterPlayerResponseDto
  extends PublicRosterPlayerResponseDto
  implements AdminRosterPlayerView
{
  @ApiProperty({ type: String, nullable: true, example: 'FA******01' })
  studentIdMasked!: string | null
}

export class AdminTeamRegistrationDetailResponseDto
  extends AdminTeamRegistrationListItemResponseDto
  implements AdminTeamRegistrationDetailView
{
  @ApiProperty({ type: String, nullable: true })
  leaderDisplayName!: string | null

  @ApiProperty({ type: String, nullable: true })
  coachDisplayName!: string | null

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  importBatchId!: string | null

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  importedAt!: string | null

  @ApiProperty({ type: () => [AdminRosterPlayerResponseDto] })
  players!: AdminRosterPlayerResponseDto[]
}
