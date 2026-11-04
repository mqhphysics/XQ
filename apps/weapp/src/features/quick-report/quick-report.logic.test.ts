import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DRAFT_MAX_AGE_MS,
  QUICK_REPORT_TYPE,
  applySubmissionOutcome,
  createDraftKey,
  getResumeDecision,
  getRestoreDecision,
  markDraftSubmitted,
  mergeNonConflictingChanges,
  type QuickReportClientState,
  type QuickReportDraft,
  type QuickReportFields,
  type QuickReportServerSnapshot,
  type SubmitQuickReportResult,
} from './quick-report.logic.ts'

const baseFields: QuickReportFields = {
  homeScore: 1,
  awayScore: 0,
  outcome: 'FINISHED',
  goals: [{ id: 'goal-1', team: 'HOME', minute: 12, scorer: '7 号' }],
  notes: '',
}

function createDraft(overrides: Partial<QuickReportDraft> = {}): QuickReportDraft {
  return {
    context: {
      organizationId: 'org-east-campus',
      matchId: 'match-001',
      userId: 'user-reporter-01',
      reportType: QUICK_REPORT_TYPE,
    },
    baseVersion: 3,
    baseFields,
    fields: baseFields,
    savedAt: new Date('2026-06-10T08:00:00.000Z').toISOString(),
    ...overrides,
  }
}

function createSnapshot(
  version: number,
  fields: QuickReportFields = baseFields,
): QuickReportServerSnapshot {
  return {
    matchId: 'match-001',
    version,
    homeTeamName: '绿茵学院',
    awayTeamName: '星火学院',
    fields,
    updatedAt: `2026-06-10T08:0${version}:00.000Z`,
  }
}

function createClientState(
  overrides: Partial<QuickReportClientState> = {},
): QuickReportClientState {
  return {
    snapshot: createSnapshot(3),
    fields: {
      ...baseFields,
      notes: '本地待提交内容',
    },
    baseFields,
    baseVersion: 3,
    dirty: true,
    ...overrides,
  }
}

function createSubmitResult(): SubmitQuickReportResult {
  const submittedFields: QuickReportFields = {
    ...baseFields,
    homeScore: 2,
    notes: '已提交内容',
  }

  return {
    submissionId: 'submission-match-001-4',
    submittedVersion: 4,
    submittedAt: '2026-06-10T08:04:00.000Z',
    snapshot: createSnapshot(4, submittedFields),
  }
}

test('draft key includes organization, match, user and report type', () => {
  assert.equal(
    createDraftKey(createDraft().context),
    'draft:org-east-campus:match-001:user-reporter-01:QUICK_MATCH_REPORT',
  )
})

test('restore decision restores only a fresh draft based on the current version', () => {
  const now = Date.parse('2026-06-10T09:00:00.000Z')
  assert.equal(getRestoreDecision(createDraft(), 3, now), 'RESTORE')
  assert.equal(getRestoreDecision(createDraft(), 4, now), 'CONFLICT')
  assert.equal(getRestoreDecision(null, 3, now), 'NONE')
})

test('restore decision expires drafts older than seven days', () => {
  const now = Date.parse('2026-06-10T08:00:00.000Z') + DRAFT_MAX_AGE_MS + 1
  assert.equal(getRestoreDecision(createDraft(), 3, now), 'EXPIRED')
})

test('restore decision ignores a draft already acknowledged as submitted', () => {
  const submittedDraft = markDraftSubmitted(createDraft(), createSubmitResult())

  assert.equal(getRestoreDecision(submittedDraft, 4), 'SUBMITTED')
  assert.equal(submittedDraft.submissionId, 'submission-match-001-4')
  assert.equal(submittedDraft.submittedVersion, 4)
})

test('conflict merge keeps local-only changes and accepts current server changes', () => {
  const local: QuickReportFields = {
    ...baseFields,
    notes: '本地补充：下半场开始前已核对。',
  }
  const current: QuickReportFields = {
    ...baseFields,
    awayScore: 1,
  }

  const result = mergeNonConflictingChanges(baseFields, local, current)

  assert.deepEqual(result.conflicts, [])
  assert.equal(result.merged.notes, local.notes)
  assert.equal(result.merged.awayScore, 1)
})

test('conflict merge never silently overwrites a field changed on both sides', () => {
  const local: QuickReportFields = {
    ...baseFields,
    homeScore: 2,
  }
  const current: QuickReportFields = {
    ...baseFields,
    homeScore: 3,
  }

  const result = mergeNonConflictingChanges(baseFields, local, current)

  assert.deepEqual(result.conflicts, ['homeScore'])
  assert.equal(result.merged.homeScore, 3)
})

test('submission success while backgrounded records the server fact and clears dirty state', () => {
  const result = createSubmitResult()
  const nextState = applySubmissionOutcome(createClientState(), {
    type: 'SUCCESS',
    result,
  })

  assert.equal(nextState.snapshot.version, 4)
  assert.equal(nextState.baseVersion, 4)
  assert.deepEqual(nextState.baseFields, result.snapshot.fields)
  assert.deepEqual(nextState.fields, result.snapshot.fields)
  assert.equal(nextState.dirty, false)
})

test('successful background submission resumes without conflicting with its own version', () => {
  const result = createSubmitResult()
  const nextState = applySubmissionOutcome(createClientState(), {
    type: 'SUCCESS',
    result,
  })

  assert.equal(getResumeDecision(nextState, result.snapshot), 'APPLY_SERVER')
})

test('network failure while backgrounded keeps the local draft dirty', () => {
  const failedState = applySubmissionOutcome(createClientState(), {
    type: 'NETWORK_FAILURE',
  })

  assert.equal(failedState.dirty, true)
  assert.equal(failedState.baseVersion, 3)
  assert.equal(failedState.fields.notes, '本地待提交内容')
  assert.equal(getResumeDecision(failedState, createSnapshot(3)), 'KEEP_LOCAL')
})

test('submitted draft marker prevents resurrection when local deletion fails', () => {
  const result = createSubmitResult()
  const submittedDraft = markDraftSubmitted(createDraft({ fields: result.snapshot.fields }), result)

  assert.equal(getRestoreDecision(submittedDraft, result.submittedVersion), 'SUBMITTED')
})

test('a real external update still conflicts while unsaved local changes remain', () => {
  const failedState = applySubmissionOutcome(createClientState(), {
    type: 'NETWORK_FAILURE',
  })
  const externalSnapshot = createSnapshot(4, {
    ...baseFields,
    awayScore: 1,
  })

  assert.equal(getResumeDecision(failedState, externalSnapshot), 'CONFLICT')
})
