import assert from 'node:assert/strict'
import test from 'node:test'
import { parseNativeDetailUrl } from './detail-route.weapp.ts'

test('detail routes match exact pages and require the corresponding object', () => {
  assert.equal(parseNativeDetailUrl('/pages/readonly-match-detail/index?matchId=match-1')?.params.matchId, 'match-1')
  assert.equal(parseNativeDetailUrl('/pages/post-detail/index?postId=post-1')?.params.postId, 'post-1')
  assert.equal(parseNativeDetailUrl('/pages/post-detail/index'), null)
  assert.equal(parseNativeDetailUrl('/pages/retired/index'), null)
  assert.equal(parseNativeDetailUrl('/pages/fake/player-detail/index?playerId=x'), null)
})

test('notifications remain available while compose, private threads and malformed links are rejected', () => {
  assert.ok(parseNativeDetailUrl('/pages/messages/index'))
  assert.ok(parseNativeDetailUrl('/pages/messages/index?notificationId=notice-1'))
  assert.equal(parseNativeDetailUrl('/pages/messages/index?conversationId=private-1'), null)
  assert.equal(parseNativeDetailUrl('/pages/compose/index'), null)
  assert.equal(parseNativeDetailUrl('/pages/player-detail/index?playerId=%ZZ'), null)
})
