import test from 'node:test'
import assert from 'node:assert/strict'
import { playerAvatar } from './player-avatar'
test('player photos use a custom avatar first, portrait next, and no stock illustration', () => {
  assert.equal(
    playerAvatar({ avatarUrl: '/head.webp', portraitUrl: '/portrait.webp' }),
    '/head.webp',
  )
  assert.equal(
    playerAvatar({
      avatarUrl: '/api/media/defaults/player-avatar-01-v1.webp',
      portraitUrl: '/portrait.webp',
    }),
    '/portrait.webp',
  )
  assert.equal(playerAvatar({ avatarUrl: '/api/media/defaults/user-avatar-01-v1.webp' }), null)
})
