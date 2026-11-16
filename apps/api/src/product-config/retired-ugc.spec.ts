import assert from 'node:assert/strict'
import test from 'node:test'
import { retiredUgcRequest } from './retired-ugc'
import { buildProductConfiguration } from './product-config.service'

test('public authoring and every private-message route stay retired', () => {
  for (const [method, route] of [
    ['POST', 'community/posts'],
    ['PATCH', 'community/posts/:postId'],
    ['POST', 'community/posts/:postId/comments'],
    ['PATCH', 'community/posts/:postId/comments/:commentId'],
    ['GET', 'messages/directory'],
    ['GET', 'messages/conversations'],
    ['GET', 'messages/conversations/:id'],
    ['PUT', 'messages/conversations/:id/read'],
    ['POST', 'messages/direct/:id'],
  ])
    assert.equal(retiredUgcRequest(method!, route!), true, method + ' ' + route)
  assert.equal(
    retiredUgcRequest('POST', 'matches/:matchId/reviews', { rating: 5, body: 'text' }),
    true,
  )
  assert.equal(
    buildProductConfiguration({ XIAOQIU_FEATURE_DIRECT_MESSAGES: 'true' }).modules.directMessages
      .enabled,
    false,
  )
})

test('official publication, notices, profile edits, likes, favorites and star ratings remain available', () => {
  for (const [method, route] of [
    ['POST', 'admin/center/posts'],
    ['GET', 'public/posts'],
    ['GET', 'me/notifications'],
    ['PUT', 'me/notifications/:id/read'],
    ['PATCH', 'auth/me'],
    ['POST', 'auth/me/avatar'],
    ['PUT', 'community/posts/:id/like'],
    ['PUT', 'community/posts/:id/favorite'],
    ['PUT', 'matches/:id/check-in'],
    ['POST', 'reports'],
  ])
    assert.equal(retiredUgcRequest(method!, route!), false, method + ' ' + route)
  assert.equal(retiredUgcRequest('POST', 'matches/:matchId/reviews', { rating: 5 }), false)
})
