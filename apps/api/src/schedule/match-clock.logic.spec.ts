import assert from 'node:assert/strict'
import test from 'node:test'
import { matchClockView, type ClockMatch } from './match-clock.logic'

const start = new Date('2026-11-07T04:20:00Z')
const match: ClockMatch = {
  id: 'match',
  organizationId: 'org',
  tournamentId: 'cup',
  status: 'SCHEDULED',
  scheduledStartAt: start,
  actualStartedAt: null,
  actualEndedAt: null,
}
const rules = { match: { periods: 2, periodMinutes: 30, intervalMinutes: 10 } }
test('automatic clock waits ten minutes then uses a kickoff five minutes after the schedule', () => {
  const pending = matchClockView(match, rules, start.getTime() + 10 * 60000 - 1, true)
  assert.equal(pending.phase, 'PENDING')
  assert.equal(pending.canStart, true)
  const automatic = matchClockView(match, rules, start.getTime() + 10 * 60000, true)
  assert.equal(automatic.phase, 'FIRST_HALF')
  assert.equal(automatic.elapsedSeconds, 300)
  assert.equal(automatic.startedAt, new Date(start.getTime() + 5 * 60000).toISOString())
  assert.equal(automatic.startSource, 'AUTO')
  assert.equal(automatic.canStart, false)
})
test('manual kickoff sets the server clock basis and the configured half-time pauses playing time', () => {
  const actual = new Date(start.getTime() + 5 * 60000),
    manual = { ...match, actualStartedAt: actual, status: 'LIVE' }
  const half = matchClockView(manual, rules, actual.getTime() + 35 * 60000)
  assert.equal(half.startSource, 'MANUAL')
  assert.equal(half.phase, 'HALF_TIME')
  assert.equal(half.elapsedSeconds, 30 * 60)
  assert.equal(half.phaseElapsedSeconds, 5 * 60)
  const second = matchClockView(manual, rules, actual.getTime() + 45 * 60000)
  assert.equal(second.phase, 'SECOND_HALF')
  assert.equal(second.elapsedSeconds, 35 * 60)
  const finished = matchClockView(manual, rules, actual.getTime() + 70 * 60000)
  assert.equal(finished.phase, 'FINISHED')
  assert.equal(finished.elapsedSeconds, 60 * 60)
  assert.equal(finished.endedAt, new Date(actual.getTime() + 70 * 60000).toISOString())
})
test('cancelled and postponed matches never expose a start action', () => {
  for (const status of ['DRAFT', 'CANCELLED', 'POSTPONED']) {
    const result = matchClockView({ ...match, status }, rules, start.getTime(), true)
    assert.equal(result.phase, 'UNAVAILABLE')
    assert.equal(result.canStart, false)
  }
})
