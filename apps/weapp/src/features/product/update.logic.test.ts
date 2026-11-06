import test from 'node:test'
import assert from 'node:assert/strict'
import { canPromptNativeUpdate } from './update.logic.ts'
test('updates wait for an idle main page, never interrupting login, registration or detail work', () => {
  for (const route of ['', 'pages/login/index', 'pages/team-manage/index', 'pages/readonly-match-detail/index'])
    assert.equal(canPromptNativeUpdate(route, false, true), false)
  assert.equal(canPromptNativeUpdate('pages/index/index', true, true), false)
  assert.equal(canPromptNativeUpdate('pages/index/index', false, false), false)
  assert.equal(canPromptNativeUpdate('pages/index/index', false, true), true)
})
