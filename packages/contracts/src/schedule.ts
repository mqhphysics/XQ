export const TOURNAMENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
export const COMPETITION_RULE_VERSION_STATUSES = ['PUBLISHED', 'RETIRED'] as const
export const STAGE_TYPES = ['GROUP', 'KNOCKOUT'] as const
export const SCHEDULE_PLAN_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const
export const SCHEDULE_REVISION_STATUSES = ['PUBLISHED'] as const
export const MATCH_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'LIVE',
  'FINISHED',
  'POSTPONED',
  'CANCELLED',
] as const

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number]
export type CompetitionRuleVersionStatus = (typeof COMPETITION_RULE_VERSION_STATUSES)[number]
export type StageType = (typeof STAGE_TYPES)[number]
export type SchedulePlanStatus = (typeof SCHEDULE_PLAN_STATUSES)[number]
export type ScheduleRevisionStatus = (typeof SCHEDULE_REVISION_STATUSES)[number]
export type MatchStatus = (typeof MATCH_STATUSES)[number]

export interface SeasonView {
  id: string
  organizationId: string
  seasonCode: string
  name: string
  startsOn?: string | null
  endsOn?: string | null
}

export interface TournamentView {
  id: string
  organizationId: string
  seasonId: string
  tournamentCode: string
  name: string
  status: TournamentStatus
}

export interface CompetitionRuleVersionView {
  id: string
  organizationId: string
  tournamentId: string
  version: number
  name: string
  status: CompetitionRuleVersionStatus
  rules: Record<string, unknown>
  publishedAt: string
}

export interface TeamView {
  id: string
  organizationId: string
  teamCode: string
  name: string
  shortName?: string | null
}

export interface VenueView {
  id: string
  organizationId: string
  venueCode: string
  name: string
  address?: string | null
}

export interface MatchTeamView {
  id: string
  teamCode: string
  name: string
  shortName?: string | null
}

export interface MatchVenueView {
  id: string
  venueCode: string
  name: string
}

export interface MatchView {
  id: string
  organizationId: string
  tournamentId: string
  matchCode: string
  title: string
  status: MatchStatus
  scheduledStartAt?: string | null
  homeTeam?: MatchTeamView | null
  awayTeam?: MatchTeamView | null
  venue?: MatchVenueView | null
}

export interface SchedulePlanView {
  id: string
  organizationId: string
  tournamentId: string
  name: string
  status: SchedulePlanStatus
  publishedAt?: string | null
}

export interface ScheduleRevisionView {
  id: string
  organizationId: string
  tournamentId: string
  schedulePlanId: string
  version: number
  status: ScheduleRevisionStatus
  publishedAt: string
}

export interface TournamentDetailView extends TournamentView {
  season: SeasonView
  ruleVersions: CompetitionRuleVersionView[]
}

export interface TournamentScheduleView {
  tournament: TournamentView
  revision: ScheduleRevisionView
  matches: MatchView[]
}

export interface PublicTournamentListView {
  items: TournamentView[]
}
