import assert from 'node:assert/strict'
import test from 'node:test'
import { playerAvatarInitial, playerAvatarPhoto } from './player-avatar.logic.h5.ts'

test('player defaults use the last Unicode character of the current name', () => {
  assert.equal(playerAvatarInitial(' 王锐杰 '), '杰')
  assert.equal(playerAvatarInitial('王闻雨'), '雨')
  assert.equal(playerAvatarInitial('阿布都许库尔麦合木提'), '提')
  assert.equal(playerAvatarInitial('李𠮷'), '𠮷')
})
test('legacy defaults fall back to initials and actual player photos stay', () => {
  assert.equal(playerAvatarPhoto('/api/media/defaults/player-avatar-02-v1.webp'), null)
  assert.equal(
    playerAvatarPhoto('https://api.example/api/media/defaults/user-avatar-12-v1.webp?w=96'),
    null,
  )
  assert.equal(playerAvatarPhoto(null), null)
  assert.equal(playerAvatarPhoto('/api/media/avatars/real.webp'), '/api/media/avatars/real.webp')
  assert.equal(
    playerAvatarPhoto('/api/media-assets/photo/content'),
    '/api/media-assets/photo/content',
  )
})
