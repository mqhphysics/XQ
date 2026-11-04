import type { Match, OrganizationContext } from '../adminSchedule/types'

export interface WorkflowProps {
  context: OrganizationContext
  tournamentId: string
  matches?: Match[]
}

export type RosterAction = 'RETURN' | 'APPROVE' | 'LOCK' | 'REOPEN'
export interface RosterWorkflow {
  tournamentId: string
  tournamentName: string
  teamId: string
  teamName: string
  registrationId: string
  registrationStatus: string
  version: number
  status: string
  policy: {
    minPlayers: number
    maxPlayers: number
    submissionDeadline: string
    ruleVersionId: string
    playersOnPitch: number | null
  } | null
  decisionReason: string | null
  lockedSnapshot: {
    id: string
    version: number
    players: { id: string; displayName: string; shirtNumber: string | null }[]
  } | null
  players: { playerId: string; displayName: string; shirtNumber: string | null }[]
  availablePlayers: { playerId: string; displayName: string; eligible: boolean }[]
}

export type ReportAction = 'SAVE' | 'SUBMIT' | 'RETURN' | 'CONFIRM' | 'CORRECT'
export type ReportSide = 'HOME' | 'AWAY'
export type ReportOutcome = 'FINISHED' | 'HOME_FORFEIT' | 'AWAY_FORFEIT' | 'ABANDONED'
export type EventKind = 'GOAL' | 'OWN_GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUBSTITUTION'
export interface ReportEvent {
  clientEventId: string
  kind: EventKind
  side: ReportSide
  minute: string
  addedMinute: string
  playerId: string
  relatedPlayerId: string
}
export interface ReportFields {
  homeScore: string
  awayScore: string
  homePenaltyScore: string
  awayPenaltyScore: string
  outcome: ReportOutcome
  events: ReportEvent[]
  notes: string
}
export interface ReportPlayer {
  id: string
  displayName: string
  shirtNumber: string | null
}
export interface ReportRevision {
  version: number
  savedAt: string
  savedBy: string
  status: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'CONFIRMED'
  action: ReportAction
  reason: string
  fields: ReportFields
  homeRosterSnapshotId: string
  awayRosterSnapshotId: string
  ruleVersionId: string
  homePlayers?: ReportPlayer[]
  awayPlayers?: ReportPlayer[]
}
export interface ReportWorkspace {
  organizationId: string
  matchId: string
  title: string
  ruleVersionId: string | null
  isKnockout: boolean
  reportVersion: number
  confirmedReportVersion: number | null
  savedVersion?: number
  homeTeam: { id: string; name: string; rosterSnapshotId: string | null; players: ReportPlayer[] }
  awayTeam: { id: string; name: string; rosterSnapshotId: string | null; players: ReportPlayer[] }
  permissions: {
    canPublish?: boolean
    canEdit: boolean
    canSubmit: boolean
    canViewHistory: boolean
    canCorrect: boolean
    canConfirm: boolean
    canReturn: boolean
  }
  blockingReasons?: string[]
  latest: ReportRevision | null
  reviewNote: string | null
  officialResult: {
    homeScore: number | null
    awayScore: number | null
    homePenaltyScore: number | null
    awayPenaltyScore: number | null
    status: string
  }
}
export interface ReportHistory {
  items: ReportRevision[]
  nextBeforeVersion: number | null
}
export interface RuleVersion {
  id: string
  tournamentId: string
  version: number
  name: string
  rules: Record<string, unknown>
  status: string
  publishedAt: string
}
export interface ProgressionPreview {
  tournamentId: string
  ruleVersionId: string
  version: number
  sourceHash: string
  sourceVersions: unknown
  slots: { targetMatchId: string; side: ReportSide; teamId: string }[]
  status: 'READY' | 'BLOCKED'
  reasons: string[]
}
export interface OfficialResults {
  tournamentId: string
  ruleVersionId: string
  mode: 'OFFICIAL'
  groups: unknown[]
  confirmedResults: {
    id: string
    homeTeamId: string
    awayTeamId: string
    homeScore: number
    awayScore: number
    status: string
    decision: string
    confirmedReportVersion?: number
  }[]
  sourceVersions: Record<string, number>
}
