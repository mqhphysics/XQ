// H5 view types adapted from the authoritative MatchReportController DTO source.
export type Side = 'HOME' | 'AWAY'
export type Outcome = 'FINISHED' | 'HOME_FORFEIT' | 'AWAY_FORFEIT' | 'ABANDONED'
export type EventKind = 'GOAL' | 'OWN_GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUBSTITUTION'
export type ReportStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'CONFIRMED'

export interface ReportEvent {
  id: string
  kind: EventKind
  side: Side
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
  outcome: Outcome
  events: ReportEvent[]
  notes: string
}

export interface RosterPlayer {
  id: string
  displayName: string
  shirtNumber: string | null
}

export interface ReportRevision {
  version: number
  savedAt: string
  savedBy: string
  status: ReportStatus
  reason: string
  fields: ReportFields
  homeRosterSnapshotId: string
  awayRosterSnapshotId: string
  ruleVersionId: string
  homePlayers?: RosterPlayer[]
  awayPlayers?: RosterPlayer[]
}

export interface ReportWorkspace {
  reportVersion?: number
  editorToken?: string
  inline?: { editor: boolean; canStart: boolean; completed: boolean; changeRequested: boolean }
  completion?: { published: boolean; retained: boolean }
  organizationId: string
  matchId: string
  title: string
  ruleVersionId: string | null
  isKnockout: boolean
  savedVersion?: number
  confirmedReportVersion?: number | null
  officialResult?: { homeScore: number | null; awayScore: number | null; status: string }
  homeTeam: { id: string; name: string; rosterSnapshotId: string | null; players: RosterPlayer[] }
  awayTeam: { id: string; name: string; rosterSnapshotId: string | null; players: RosterPlayer[] }
  permissions: {
    canEdit: boolean
    canSubmit: boolean
    canViewHistory: boolean
    canCorrect: boolean
    canConfirm: boolean
    canReturn: boolean
  }
  latest: ReportRevision | null
  reviewNote: string | null
  blockingReasons?: string[]
}

export interface SaveReportCommand {
  clientActionId: string
  expectedVersion: number
  action: 'SAVE' | 'SUBMIT' | 'RETURN' | 'CONFIRM' | 'CORRECT' | 'COMPLETE' | 'SAVE_SCORE'
  editorToken?: string
  reason: string
  fields: ReportFields
  homeRosterSnapshotId: string
  awayRosterSnapshotId: string
  ruleVersionId: string
}

export interface ReportGateway {
  load(matchId: string): Promise<ReportWorkspace>
  history(
    matchId: string,
    beforeVersion?: number,
  ): Promise<{ items: ReportRevision[]; nextBeforeVersion: number | null }>
  save(matchId: string, command: SaveReportCommand): Promise<ReportWorkspace>
}

export interface LocalReportDraft {
  schemaVersion: 1
  baseVersion: number
  fields: ReportFields
  reason: string
  savedAt: string
  pending: SaveReportCommand | null
}
