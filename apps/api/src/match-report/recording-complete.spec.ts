import assert from 'node:assert/strict'
import test from 'node:test'
import { recordingComplete } from '@xiaoqiu/contracts'
const goal = { kind: 'GOAL', side: 'HOME', playerId: 'scorer', minute: '12' }
test('complete recording requires goal coverage, scorer and time while assists are optional', () => {
  assert.equal(recordingComplete(1, 0, []), false)
  assert.equal(recordingComplete(1, 0, [goal]), true)
  assert.equal(recordingComplete(1, 0, [{ ...goal, playerId: '' }]), false)
  assert.equal(recordingComplete(1, 0, [{ ...goal, minute: '' }]), false)
  assert.equal(recordingComplete(1, 0, [{ ...goal, minute: '0' }]), true)
  assert.equal(recordingComplete(1, 0, [goal, goal]), false)
  assert.equal(recordingComplete(0, 0, []), true)
  assert.equal(recordingComplete(null, 0, []), false)
  assert.equal(recordingComplete(0, 1, [{ ...goal, kind: 'OWN_GOAL' }]), true)
  assert.equal(recordingComplete(1, 0, [{ ...goal, kind: 'OWN_GOAL' }]), false)
})
