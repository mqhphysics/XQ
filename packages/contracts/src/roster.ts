export const TEAM_REGISTRATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'RETURNED',
  'WITHDRAWN',
  'SUSPENDED',
] as const

export const ROSTER_SUBMISSION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'RETURNED',
  'APPROVED',
  'LOCKED',
  'REOPENED',
  'WITHDRAWN',
] as const

export const DATA_QUALITY_STATUSES = ['CLEAN', 'WARNING', 'ERROR'] as const

export type TeamRegistrationStatus = (typeof TEAM_REGISTRATION_STATUSES)[number]
export type RosterSubmissionStatus = (typeof ROSTER_SUBMISSION_STATUSES)[number]
export type DataQualityStatus = (typeof DATA_QUALITY_STATUSES)[number]

export interface PublicTournamentTeamListItemView {
  id: string
  tournamentId: string
  teamCode: string
  name: string
  shortName: string | null
  registrationStatus: TeamRegistrationStatus
  rosterStatus: RosterSubmissionStatus
  rosterPlayerCount: number
}

export interface PublicTournamentTeamListView {
  items: PublicTournamentTeamListItemView[]
}

export interface PublicRosterPlayerView {
  id: string
  displayName: string
  shirtNumber: string | null
}

export interface PublicTournamentTeamDetailView extends PublicTournamentTeamListItemView {
  leaderDisplayName: string | null
  coachDisplayName: string | null
  rosterSnapshotVersion: number
  players: PublicRosterPlayerView[]
}

export interface AdminTeamRegistrationListItemView {
  registrationId: string
  teamId: string
  teamCode: string
  teamName: string
  registrationStatus: TeamRegistrationStatus
  rosterStatus: RosterSubmissionStatus | null
  rosterSubmissionVersion: number | null
  rosterSnapshotVersion: number | null
  playerCount: number
  dataQualityStatus: DataQualityStatus | null
  warningCodes: string[]
  contactName: string | null
  contactPhoneMasked: string | null
}

export interface AdminTeamRegistrationListView {
  items: AdminTeamRegistrationListItemView[]
}

export interface AdminRosterPlayerView extends PublicRosterPlayerView {
  studentIdMasked: string | null
}

export interface AdminTeamRegistrationDetailView extends AdminTeamRegistrationListItemView {
  leaderDisplayName: string | null
  coachDisplayName: string | null
  importBatchId: string | null
  importedAt: string | null
  players: AdminRosterPlayerView[]
}
