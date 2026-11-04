import type { OrganizationContext, RepositoryMode } from '../adminSchedule/types'

export type RosterReviewFilter = 'all' | 'warnings' | 'unlocked' | 'locked'

export interface RosterReviewTournament {
  id: string
  code: string
  name: string
}

export interface RosterRegistrationReview {
  registrationId: string
  teamId: string
  teamCode: string
  teamName: string
  registrationStatus: string
  rosterStatus: string | null
  rosterSubmissionVersion: number | null
  rosterSnapshotVersion: number | null
  playerCount: number
  dataQualityStatus: string | null
  warningCodes: string[]
  contactName: string | null
  contactPhoneMasked: string | null
}

export interface RosterPlayerReview {
  id: string
  displayName: string
  studentIdMasked: string | null
  shirtNumber: string | null
}

export interface RosterRegistrationDetail extends RosterRegistrationReview {
  leaderDisplayName: string | null
  coachDisplayName: string | null
  importBatchId: string | null
  importedAt: string | null
  players: RosterPlayerReview[]
}

export interface AdminRosterRepository {
  mode: RepositoryMode
  apiBaseUrl: string | null
  listRegistrations(
    context: OrganizationContext,
    tournamentId: string,
  ): Promise<RosterRegistrationReview[]>
  getRegistration(
    context: OrganizationContext,
    tournamentId: string,
    registrationId: string,
  ): Promise<RosterRegistrationDetail>
}

export class AdminRosterRepositoryError extends Error {
  readonly status: number
  readonly code: string | null
  readonly requestId: string | null

  constructor(
    message: string,
    status: number,
    code: string | null = null,
    requestId: string | null = null,
  ) {
    super(message)
    this.name = 'AdminRosterRepositoryError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

export type AdminRosterContext = OrganizationContext
