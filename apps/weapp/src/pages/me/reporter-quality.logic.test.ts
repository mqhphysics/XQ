import assert from 'node:assert/strict'
import test from 'node:test'
import { qualityChanges } from './reporter-quality.logic.ts'
const penalty = { id: 'penalty', delta: -10, scoreBefore: 100, scoreAfter: 90 }
test('score changes are played once and real new entries retain their direction and ordering', () => {
  assert.deepEqual(qualityChanges({ id: 'p', score: 90 }, [penalty], null), [
    { from: 100, to: 90, delta: -10 },
  ])
  const seen = { profileId: 'p', entryId: 'penalty', score: 90 }
  assert.deepEqual(qualityChanges({ id: 'p', score: 90 }, [penalty], seen), [])
  assert.deepEqual(
    qualityChanges(
      { id: 'p', score: 100 },
      [{ id: 'reward', delta: 10, scoreBefore: 90, scoreAfter: 100 }, penalty],
      seen,
    ),
    [{ from: 90, to: 100, delta: 10 }],
  )
  assert.deepEqual(
    qualityChanges(
      { id: 'p', score: 90 },
      [{ id: 'cap', delta: 0, scoreBefore: 90, scoreAfter: 90 }, penalty],
      seen,
    ),
    [],
  )
  assert.deepEqual(
    qualityChanges({ id: 'p', score: 90 }, [], { profileId: 'other', entryId: 'x', score: 0 }),
    [],
  )
})
