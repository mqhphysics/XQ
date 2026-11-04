export type WorkbenchSection = 'events' | 'teams' | 'rosters' | 'schedule'

export type RepositoryMode = 'api' | 'mock'

export interface OrganizationContext {
  organizationId: string
  organizationName: string
  userId: string
  role: 'PLATFORM_ADMIN' | 'ORGANIZATION_ADMIN' | 'TOURNAMENT_ADMIN'
  accessToken: string
  canManageOrganization: boolean
}

export interface Season {
  id: string
  code: string
  name: string
  year: number
  createdAt: string
}

export interface Tournament {
  id: string
  seasonId: string
  code: string
  name: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  createdAt: string
}

export interface RuleVersion {
  id: string
  tournamentId: string
  version: number
  summary: string
  status: 'PUBLISHED'
  publishedAt: string
}

export interface Team {
  id: string
  code: string
  name: string
  shortName: string
  crestPlaceholder: string
  createdAt: string
}

export interface Venue {
  id: string
  code: string
  name: string
  campus: string
  location: string
  createdAt: string
}

export interface Match {
  id: string
  tournamentId: string
  homeTeamId: string
  awayTeamId: string
  venueId: string
  scheduledStartAt: string
  status: 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED'
  createdAt: string
}

export interface SchedulePlan {
  id: string
  tournamentId: string
  name: string
  matchIds: string[]
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED'
  version: number
  validationMessage: string
  publishedVersion: number | null
  publishedAt: string | null
  updatedAt: string
}

export interface AdminScheduleSnapshot {
  seasons: Season[]
  tournaments: Tournament[]
  ruleVersions: RuleVersion[]
  teams: Team[]
  venues: Venue[]
  matches: Match[]
  schedulePlans: SchedulePlan[]
}

export interface CreateSeasonInput {
  code: string
  name: string
  year: number
}

export interface CreateTournamentInput {
  seasonId: string
  code: string
  name: string
}

export interface PublishRuleVersionInput {
  tournamentId: string
  version: number
  summary: string
}

export interface CreateTeamInput {
  tournamentId: string
  code: string
  name: string
  shortName: string
  crestPlaceholder: string
}

export interface CreateVenueInput {
  code: string
  name: string
  campus: string
  location: string
}

export interface CreateMatchInput {
  tournamentId: string
  homeTeamId: string
  awayTeamId: string
  venueId: string
  scheduledStartAt: string
}

export interface CreateSchedulePlanInput {
  tournamentId: string
  name: string
  matchIds: string[]
}

export interface AdminScheduleRepository {
  mode: RepositoryMode
  apiBaseUrl: string | null
  loadSnapshot(context: OrganizationContext): Promise<AdminScheduleSnapshot>
  createSeason(context: OrganizationContext, input: CreateSeasonInput): Promise<Season>
  createTournament(context: OrganizationContext, input: CreateTournamentInput): Promise<Tournament>
  publishRuleVersion(
    context: OrganizationContext,
    input: PublishRuleVersionInput,
  ): Promise<RuleVersion>
  createTeam(context: OrganizationContext, input: CreateTeamInput): Promise<Team>
  createVenue(context: OrganizationContext, input: CreateVenueInput): Promise<Venue>
  createMatch(context: OrganizationContext, input: CreateMatchInput): Promise<Match>
  createSchedulePlan(
    context: OrganizationContext,
    input: CreateSchedulePlanInput,
  ): Promise<SchedulePlan>
  validateSchedulePlan(context: OrganizationContext, planId: string): Promise<SchedulePlan>
  publishSchedulePlan(context: OrganizationContext, planId: string): Promise<SchedulePlan>
}
