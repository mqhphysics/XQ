import assert from 'node:assert/strict'
import test from 'node:test'
import { completedReinstatement, confirmedError, qualifiedMatch } from './reporter-quality.rules'

test('four errors retain eligibility at 60; fifth error freezes; three qualified matches add 10', () => {
  let state = { score: 100, status: 'ACTIVE', reinstatementCount: 0, consecutiveQualified: 0 }
  for (let i = 0; i < 4; i++) state = { ...state, ...confirmedError(state) }
  assert.equal(state.score, 60)
  assert.equal(state.status, 'ACTIVE')
  state = { ...state, ...confirmedError(state) }
  assert.equal(state.score, 50)
  assert.equal(state.status, 'FROZEN')
  const resumed = { ...state, ...completedReinstatement(state) }
  assert.equal(resumed.score, 60)
  assert.equal(resumed.status, 'PROBATION')
  let good = resumed
  for (let i = 0; i < 3; i++) good = { ...good, ...qualifiedMatch(good) }
  assert.equal(good.score, 70)
  assert.equal(good.consecutiveQualified, 0)
})
test('confirmed errors use the report occurrence time, not a delayed adjudication time', () => {
  const state = {
    score: 60,
    status: 'PROBATION',
    reinstatementCount: 1,
    consecutiveQualified: 2,
    probationStartedAt: new Date('2026-01-01Z'),
    probationUntil: new Date('2026-12-31Z'),
  }
  assert.equal(confirmedError(state, new Date('2026-06-01Z')).score, 40)
  assert.equal(confirmedError(state, new Date('2025-12-01Z')).score, 50)
  assert.equal(
    confirmedError(
      { ...state, status: 'ACTIVE', probationCompletedAt: new Date('2026-12-31Z') },
      new Date('2027-01-01Z'),
    ).score,
    50,
  )
})
test('repeated reinstatement does not manufacture points; zero is banned, rewards cap at 100', () => {
  const state = { score: 40, status: 'FROZEN', reinstatementCount: 1, consecutiveQualified: 0 }
  const resumed = completedReinstatement(state)
  assert.equal(resumed.score, 40)
  const second = { ...state, ...resumed, ...confirmedError({ ...state, ...resumed }) }
  assert.equal(second.score, 20)
  const third = confirmedError({ ...second, status: 'PROBATION' })
  assert.equal(third.score, 0)
  assert.equal(third.status, 'BANNED')
  assert.equal(
    qualifiedMatch({ score: 100, status: 'ACTIVE', reinstatementCount: 0, consecutiveQualified: 2 })
      .score,
    100,
  )
})
