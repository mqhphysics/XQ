import assert from 'node:assert/strict'
import test from 'node:test'
import { matchRecording } from './match-recording'

test('an ended fixture without a report has explicit null scores and is not recorded', () => {
  assert.deepEqual(matchRecording({}), {
    recorded: false,
    confirmedReportVersion: null,
    homeScore: null,
    awayScore: null,
  })
  assert.equal(matchRecording({ confirmedReportVersion: 2, homeScore: 0 }).recorded, false)
})
test('saved draft numbers cannot be exposed as a published result', () => {
  assert.deepEqual(matchRecording({ confirmedReportVersion: null, homeScore: 3, awayScore: 1 }), {
    recorded: false,
    confirmedReportVersion: null,
    homeScore: null,
    awayScore: null,
  })
})
test('a confirmed nil-nil draw is recorded, and invalid or partial scores are not', () => {
  assert.deepEqual(matchRecording({ confirmedReportVersion: 2, homeScore: 0, awayScore: 0 }), {
    recorded: true,
    confirmedReportVersion: 2,
    homeScore: 0,
    awayScore: 0,
  })
  assert.equal(
    matchRecording({ confirmedReportVersion: 2, homeScore: NaN, awayScore: 1 }).recorded,
    false,
  )
})
