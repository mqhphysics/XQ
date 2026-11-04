export const QUICK_REPORT_TYPE = 'QUICK_MATCH_REPORT' as const
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type QuickReportType = typeof QUICK_REPORT_TYPE
export type TeamSide = 'HOME' | 'AWAY'
export type MatchOutcome = 'FINISHED' | 'HOME_FORFEIT' | 'AWAY_FORFEIT' | 'ABANDONED'

export interface GoalEventDraft {
  id: string
  team: TeamSide
  minute: number
  scorer: string
}

export interface QuickReportFields {
  homeScore: number
  awayScore: number
  outcome: MatchOutcome
  goals: GoalEventDraft[]
  notes: string
}

export interface DraftContext {
  organizationId: string
  matchId: string
  userId: string
  reportType: QuickReportType
}

export interface QuickReportDraft {
  context: DraftContext
  baseVersion: number
  baseFields: QuickReportFields
  fields: QuickReportFields
  savedAt: string
  submissionId?: string
  submittedVersion?: number
  submittedAt?: string
}

export interface QuickReportServerSnapshot {
  matchId: string
  version: number
  homeTeamName: string
  awayTeamName: string
  fields: QuickReportFields
  updatedAt: string
}

export interface SubmitQuickReportResult {
  submissionId: string
  submittedVersion: number
  submittedAt: string
  snapshot: QuickReportServerSnapshot
}

export interface QuickReportClientState {
  snapshot: QuickReportServerSnapshot
  fields: QuickReportFields
  baseFields: QuickReportFields
  baseVersion: number
  dirty: boolean
}

export type SubmissionOutcome =
  | {
      type: 'SUCCESS'
      result: SubmitQuickReportResult
    }
  | {
      type: 'NETWORK_FAILURE'
    }

export type RestoreDecision = 'NONE' | 'RESTORE' | 'CONFLICT' | 'EXPIRED' | 'SUBMITTED'
export type ResumeDecision = 'APPLY_SERVER' | 'KEEP_LOCAL' | 'CONFLICT'

export type ConflictField = 'homeScore' | 'awayScore' | 'outcome' | 'goals' | 'notes'

export interface MergeResult {
  merged: QuickReportFields
  conflicts: ConflictField[]
}

export function createDraftKey(context: DraftContext): string {
  return [
    'draft',
    context.organizationId,
    context.matchId,
    context.userId,
    context.reportType,
  ].join(':')
}

export function getRestoreDecision(
  draft: QuickReportDraft | null,
  serverVersion: number,
  now = Date.now(),
): RestoreDecision {
  if (!draft) {
    return 'NONE'
  }

  if (draft.submissionId && draft.submittedVersion !== undefined) {
    return 'SUBMITTED'
  }

  const savedAt = Date.parse(draft.savedAt)
  if (!Number.isFinite(savedAt) || now - savedAt > DRAFT_MAX_AGE_MS) {
    return 'EXPIRED'
  }

  return draft.baseVersion === serverVersion ? 'RESTORE' : 'CONFLICT'
}

export function applySubmissionOutcome(
  state: QuickReportClientState,
  outcome: SubmissionOutcome,
): QuickReportClientState {
  if (outcome.type === 'NETWORK_FAILURE') {
    return {
      ...state,
      fields: cloneFields(state.fields),
      baseFields: cloneFields(state.baseFields),
      dirty: true,
    }
  }

  const snapshot = outcome.result.snapshot
  return {
    snapshot,
    fields: cloneFields(snapshot.fields),
    baseFields: cloneFields(snapshot.fields),
    baseVersion: outcome.result.submittedVersion,
    dirty: false,
  }
}

export function getResumeDecision(
  state: QuickReportClientState,
  current: QuickReportServerSnapshot,
): ResumeDecision {
  if (!state.dirty) {
    return 'APPLY_SERVER'
  }

  return current.version === state.baseVersion ? 'KEEP_LOCAL' : 'CONFLICT'
}

export function markDraftSubmitted(
  draft: QuickReportDraft,
  result: SubmitQuickReportResult,
): QuickReportDraft {
  return {
    ...draft,
    baseVersion: result.submittedVersion,
    baseFields: cloneFields(result.snapshot.fields),
    fields: cloneFields(result.snapshot.fields),
    savedAt: result.submittedAt,
    submissionId: result.submissionId,
    submittedVersion: result.submittedVersion,
    submittedAt: result.submittedAt,
  }
}

export function cloneFields(fields: QuickReportFields): QuickReportFields {
  return {
    ...fields,
    goals: fields.goals.map((goal) => ({ ...goal })),
  }
}

export function getChangedFields(
  left: QuickReportFields,
  right: QuickReportFields,
): ConflictField[] {
  const changed: ConflictField[] = []

  if (left.homeScore !== right.homeScore) changed.push('homeScore')
  if (left.awayScore !== right.awayScore) changed.push('awayScore')
  if (left.outcome !== right.outcome) changed.push('outcome')
  if (!goalEventsEqual(left.goals, right.goals)) changed.push('goals')
  if (left.notes !== right.notes) changed.push('notes')

  return changed
}

export function mergeNonConflictingChanges(
  base: QuickReportFields,
  local: QuickReportFields,
  current: QuickReportFields,
): MergeResult {
  const homeScore = mergeValue(base.homeScore, local.homeScore, current.homeScore)
  const awayScore = mergeValue(base.awayScore, local.awayScore, current.awayScore)
  const outcome = mergeValue(base.outcome, local.outcome, current.outcome)
  const notes = mergeValue(base.notes, local.notes, current.notes)
  const goals = mergeGoalEvents(base.goals, local.goals, current.goals)

  const conflicts: ConflictField[] = []
  if (homeScore.conflict) conflicts.push('homeScore')
  if (awayScore.conflict) conflicts.push('awayScore')
  if (outcome.conflict) conflicts.push('outcome')
  if (goals.conflict) conflicts.push('goals')
  if (notes.conflict) conflicts.push('notes')

  return {
    merged: {
      homeScore: homeScore.value,
      awayScore: awayScore.value,
      outcome: outcome.value,
      goals: goals.value.map((goal) => ({ ...goal })),
      notes: notes.value,
    },
    conflicts,
  }
}

function mergeValue<T>(base: T, local: T, current: T): { value: T; conflict: boolean } {
  const localChanged = local !== base
  const currentChanged = current !== base
  const conflict = localChanged && currentChanged && local !== current

  if (conflict || !localChanged) {
    return { value: current, conflict }
  }

  return { value: local, conflict: false }
}

function mergeGoalEvents(
  base: GoalEventDraft[],
  local: GoalEventDraft[],
  current: GoalEventDraft[],
): { value: GoalEventDraft[]; conflict: boolean } {
  const localChanged = !goalEventsEqual(base, local)
  const currentChanged = !goalEventsEqual(base, current)
  const conflict = localChanged && currentChanged && !goalEventsEqual(local, current)

  if (conflict || !localChanged) {
    return { value: current, conflict }
  }

  return { value: local, conflict: false }
}

function goalEventsEqual(left: GoalEventDraft[], right: GoalEventDraft[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((goal, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      goal.id === other.id &&
      goal.team === other.team &&
      goal.minute === other.minute &&
      goal.scorer === other.scorer
    )
  })
}
