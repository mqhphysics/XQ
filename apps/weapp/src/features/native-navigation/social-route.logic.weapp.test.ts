import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeSocialUrl, redirectedSocialUrl } from './social-route.logic.weapp.ts'

test('legacy social links and new package links retain the same approved destination parameters', () => {
  assert.equal(
    redirectedSocialUrl('/pages/messages/index?notificationId=n-1&category=likes#notice-n-1'),
    '/social/messages/index?notificationId=n-1&category=likes#notice-n-1',
  )
  assert.equal(
    redirectedSocialUrl('/social/messages/index?userId=u-1'),
    '/social/messages/index?userId=u-1',
  )
  assert.equal(
    nativeSocialUrl('compose', { tournamentId: 't', teamId: 'team', quotePostId: 'post' }),
    '/social/compose/index?tournamentId=t&teamId=team&quotePostId=post',
  )
  assert.equal(nativeSocialUrl('favorites'), '/social/favorites/index')
})
test('route compatibility never forwards arbitrary callbacks or malformed object identifiers', () => {
  assert.equal(
    redirectedSocialUrl(
      '/pages/messages/index?category=settings&redirect=https%3A%2F%2Fother.test&private=0',
    ),
    '/social/messages/index?category=settings',
  )
  for (const url of [
    '/pages/messages/index?userId=..%2Fsecret',
    '/social/messages/index?conversationId=%ZZ',
    '/pages/other/index',
    '/pages/messages/index#<script>',
  ])
    assert.equal(redirectedSocialUrl(url), null)
})
