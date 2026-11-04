import assert from 'node:assert/strict'
import test from 'node:test'
import { nativePersistedPath, nativeReadKey } from './native-read-policy.ts'
import { createGetCache } from './get-cache.ts'

test('native cached responses are isolated by organization, account and session', () => {
  const path = '/public/home'
  const first = nativeReadKey(path, 'org-a', 'user-a', 'session-a')
  for (const other of [
    nativeReadKey(path, 'org-b', 'user-a', 'session-a'),
    nativeReadKey(path, 'org-a', 'user-b', 'session-a'),
    nativeReadKey(path, 'org-a', 'user-a', 'session-b'),
    nativeReadKey(path, 'org-a', undefined, ''),
    nativeReadKey('/public/home?tournamentId=other', 'org-a', 'user-a', 'session-a'),
  ])
    assert.notEqual(other, first)
})
test('native snapshot persistence excludes inboxes, private directory, auth and capabilities', () => {
  for (const path of [
    '/messaging/conversations',
    '/me/notifications',
    '/auth/me',
    '/messaging/directory',
    '/me/favorite-posts',
    '/me/capabilities',
  ])
    assert.equal(nativePersistedPath(path), false)
  for (const path of [
    '/public/home',
    '/public/posts/id',
    '/public/players/id?tournamentId=season',
    '/public/teams/id/dashboard',
  ])
    assert.equal(nativePersistedPath(path), true)
})
test('pull refresh and mutation invalidation keep visible data but force a fresh read', () => {
  const cache = createGetCache(),
    key = nativeReadKey('/public/home', 'org', 'user', 'session')
  cache.put(key, { body: 'current' }, undefined, 1000)
  assert.equal(cache.fresh(key, 8000, 1500), true)
  cache.markStale()
  assert.equal(cache.fresh(key, 8000, 1500), false)
  assert.deepEqual(cache.peek(key, 120000, 1500), { body: 'current' })
  cache.put(key, { body: 'updated' }, undefined, 1600)
  assert.deepEqual(cache.peek(key, 120000, 1601), { body: 'updated' })
})
