import assert from 'node:assert/strict'
import test from 'node:test'
import { intakeState } from '../src/features/adminWorkflows/intake-state.ts'
import { actionReason } from '../src/features/adminCenter/action-reason.ts'
import { requestActivity, beginAdminRequest } from '../src/features/adminAuth/request-activity.ts'

test('intake distinguishes completed, due, upcoming and postponed without inventing results', () => {
  const now = Date.parse('2026-10-24T06:00Z'),
    match = { status: 'SCHEDULED', scheduledStartAt: '2026-10-24T04:20Z' }
  assert.equal(intakeState({ ...match, status: 'FINISHED' }, now).kind, 'due')
  assert.equal(intakeState({ ...match, status: 'FINISHED', recorded: true }, now).kind, 'complete')
  assert.equal(intakeState(match, now).kind, 'due')
  assert.equal(
    intakeState({ ...match, scheduledStartAt: '2026-10-25T04:20Z' }, now).kind,
    'upcoming',
  )
  assert.equal(intakeState({ ...match, status: 'POSTPONED' }, now).kind, 'upcoming')
  assert.equal(intakeState({ ...match, scheduledStartAt: null }, now).kind, 'upcoming')
  assert.equal(
    intakeState({ ...match, scheduledStartAt: '2026-10-24T05:00Z', tournamentName: '女足' }, now)
      .kind,
    'due',
  )
  assert.equal(
    intakeState({ ...match, scheduledStartAt: '2026-10-24T05:00Z', tournamentName: '男足' }, now)
      .kind,
    'upcoming',
  )
})
test('routine approvals and new records need no entered reason; editing, blocking and permission changes do', () => {
  for (const [path, body] of [
    ['/admin/center/posts', {}],
    ['/admin/campus/students', {}],
    ['/admin/ai-review/jobs/1/decision', { decision: 'ALLOW' }],
    ['/admin/media-assets/1/review', { action: 'APPROVE' }],
  ] as const)
    assert.equal(actionReason(path, 'POST', body).required, false)
  for (const [path, method, body] of [
    ['/admin/campus/students/1', 'PATCH', {}],
    ['/admin/ai-review/jobs/1/decision', 'POST', { decision: 'BLOCK' }],
    ['/admin/center/users/1/sanctions', 'POST', { action: 'BAN' }],
  ] as const)
    assert.equal(actionReason(path, method, body).required, true)
})
test('refresh activity follows actual overlapping requests and returns to idle', () => {
  assert.equal(requestActivity.snapshot(), 0)
  const first = beginAdminRequest(),
    second = beginAdminRequest()
  assert.equal(requestActivity.snapshot(), 2)
  first()
  assert.equal(requestActivity.snapshot(), 1)
  second()
  assert.equal(requestActivity.snapshot(), 0)
})
