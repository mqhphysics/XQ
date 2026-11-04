import assert from 'node:assert/strict'
import test from 'node:test'
import {
  directoryTab,
  workspaceHash,
  workspaceLocation,
} from '../src/features/adminCenter/workspace-navigation.ts'

test('review destinations survive reload and Chinese directory searches round-trip', () => {
  assert.deepEqual(workspaceLocation(workspaceHash('events', 'rosters')), {
    section: 'events',
    view: 'rosters',
    query: '',
  })
  assert.deepEqual(workspaceLocation(workspaceHash('people', 'players', '  郑明澈  ')), {
    section: 'people',
    view: 'players',
    query: '郑明澈',
  })
  assert.equal(workspaceLocation('#reporters?view=applications').view, 'applications')
})
test('unknown pages and foreign tab names never redirect to another module', () => {
  assert.deepEqual(workspaceLocation('#missing?view=rosters'), {
    section: 'overview',
    view: '',
    query: '',
  })
  assert.equal(workspaceLocation('#people?view=logins').view, '')
  assert.equal(directoryTab('unknown'), 'students')
  assert.equal(workspaceHash('people', 'javascript:alert(1)'), '#people')
})
