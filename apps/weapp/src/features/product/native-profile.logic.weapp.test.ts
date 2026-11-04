import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ownsNativePlayer,
  nativePlayerPhotos,
  nativePersonUrl,
  nativePlayerAvatarUrl,
  nativePlayerInitial,
} from './native-profile.logic.weapp.ts'

test('player ownership uses stable IDs, including a public account link when the login snapshot is stale', () => {
  const user = { id: 'user-a', linkedPlayer: null }
  assert.equal(ownsNativePlayer(user, { id: 'player-a', person: { id: 'user-a' } }), true)
  assert.equal(
    ownsNativePlayer({ ...user, linkedPlayer: { id: 'player-a' } }, { id: 'player-a' }),
    true,
  )
  assert.equal(ownsNativePlayer(user, { id: 'player-a', person: { id: 'user-b' } }), false)
  assert.equal(ownsNativePlayer(null, { id: 'player-a', person: { id: 'user-a' } }), false)
})
test('player photos use actual player media, keep fallbacks and remove duplicate or empty candidates', () => {
  assert.deepEqual(nativePlayerPhotos('/avatar.jpg', '/portrait.jpg', '/avatar.jpg', null, ''), [
    '/avatar.jpg',
    '/portrait.jpg',
  ])
  assert.deepEqual(nativePlayerPhotos(null, '/portrait.jpg'), ['/portrait.jpg'])
  assert.deepEqual(nativePlayerPhotos(null, undefined, ' '), [])
})
test('personal profiles have their own route and encode IDs without creating extra query fields', () => {
  const url = nativePersonUrl('user&a=b', 'cup/2026')
  assert.ok(url.startsWith('/pages/person-detail/index?'))
  const params = new URLSearchParams(url.split('?')[1])
  assert.equal(params.get('userId'), 'user&a=b')
  assert.equal(params.get('tournamentId'), 'cup/2026')
  assert.equal(params.has('a'), false)
})

test('player stock illustrations fall back to the last name character while uploaded media survives', () => {
  assert.equal(nativePlayerInitial(' 周知远 '), '远')
  assert.equal(nativePlayerInitial('𠮷'), '𠮷')
  assert.equal(nativePlayerInitial(' '), '球')
  for (const url of [
    '/api/media/defaults/player-avatar-03-v1.webp',
    'https://media.example/api/media/defaults/player-avatar-03-v1.webp?w=96',
    '/api/media/defaults/user-avatar-16-v1.webp',
  ])
    assert.equal(nativePlayerAvatarUrl(url), null)
  assert.equal(
    nativePlayerAvatarUrl('/api/media/avatars/real-upload.webp'),
    '/api/media/avatars/real-upload.webp',
  )
  assert.deepEqual(
    nativePlayerPhotos('/api/media/defaults/player-avatar-03-v1.webp', '/portrait.jpg'),
    ['/portrait.jpg'],
  )
})
