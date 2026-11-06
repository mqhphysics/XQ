import test from 'node:test'
import assert from 'node:assert/strict'
import { safeLoginReturn } from './login-return.logic.ts'
test('login return keeps public identity only and cannot replay management operations or arbitrary links', () => {
  assert.equal(
    safeLoginReturn('/pages/readonly-match-detail/index?matchId=fixture&technical=1'),
    '/pages/readonly-match-detail/index?matchId=fixture',
  )
  for (const path of [
    'https://evil.test',
    '/pages/team-manage/index?teamId=t',
    '/pages/me/index?panel=admin',
    '/pages/player-detail/index?playerId=..%2Fsecret',
  ])
    assert.equal(safeLoginReturn(path), '/pages/index/index')
})
