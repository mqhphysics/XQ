import assert from 'node:assert/strict'
import test from 'node:test'
import { celebrationIndex, hasMatchBulletin, isGoalEventType } from './match-bulletin.logic.ts'

test('only seeded finished matches have a 快报; others are omitted', () => {
  assert.equal(hasMatchBulletin('GC26-A-R1-01'), true)
  assert.equal(hasMatchBulletin('GC26-A-R2-01'), true)
  assert.equal(hasMatchBulletin('GC26-B-R1-02'), true)
  assert.equal(hasMatchBulletin('GC26-SF-01'), true)
  assert.equal(hasMatchBulletin('GC26-A-R1-02'), false)
  assert.equal(hasMatchBulletin('GC26-SF-02'), false)
})

test('goal events receive a stable celebration index and non-goals do not qualify', () => {
  assert.equal(isGoalEventType('GOAL'), true)
  assert.equal(isGoalEventType('PENALTY_SCORED'), true)
  assert.equal(isGoalEventType('YELLOW_CARD'), false)
  assert.equal(celebrationIndex('event-a', 4), celebrationIndex('event-a', 4))
  assert.notEqual(celebrationIndex('event-a', 4), celebrationIndex('event-zzzz', 4))
})
