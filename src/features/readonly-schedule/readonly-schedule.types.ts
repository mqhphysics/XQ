export type MatchStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED'

export type PublicDataSource = 'api' | 'mock'

export interface ReadonlyTournamentSummary {
  id: string
  name: string
  code: string
  seasonName: string
  organizationName: string
  statusText: string
  startDate: string
  endDate: string
  teamCount: number
  matchCount: number
  description: string
}

export interface ReadonlyTeamSummary {
  id: string
  tournamentId: string
  teamCode: string
  name: string
  shortName: string
  registrationStatus: string
  rosterStatus: string
  rosterPlayerCount: number
}

export interface ReadonlyRosterPlayer {
  id: string
  displayName: string
  shirtNumber: string | null
}

export interface ReadonlyTeam extends ReadonlyTeamSummary {
  leaderDisplayName: string | null
  coachDisplayName: string | null
  rosterSnapshotVersion: number | null
  players: ReadonlyRosterPlayer[]
}

export interface ReadonlyMatch {
  id: string
  tournamentId: string
  stageName: string
  groupName?: string
  roundName: string
  scheduledStartAt: string
  venueName: string
  pitchName: string
  homeTeamId: string
  awayTeamId: string
  homeTeamName: string
  awayTeamName: string
  status: MatchStatus
  statusReason?: string
}

export interface ReadonlyTournamentDetail extends ReadonlyTournamentSummary {
  rules: string[]
  teams: ReadonlyTeamSummary[]
  recentMatches: ReadonlyMatch[]
}

export interface ReadonlyScheduleFixture {
  tournaments: ReadonlyTournamentDetail[]
  teamDetails: ReadonlyTeam[]
}

export interface ScheduleDateGroup {
  dateKey: string
  dateLabel: string
  stages: ScheduleStageGroup[]
}

export interface ScheduleStageGroup {
  stageName: string
  matches: ReadonlyMatch[]
}

export interface ScheduleFilters {
  dateKey?: string | undefined
  stageName?: string | undefined
}
