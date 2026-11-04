import assert from 'node:assert/strict'
import test from 'node:test'
import { createLayerOwners } from './layer-owners.logic.ts'
test('closing nested or already closed overlays preserves the remaining owner lock', () => {
  const events: boolean[] = [],
    acquire = createLayerOwners((open) => events.push(open))
  const parent = acquire(),
    child = acquire()
  child()
  child()
  assert.deepEqual(events, [true])
  parent()
  assert.deepEqual(events, [true, false])
})
