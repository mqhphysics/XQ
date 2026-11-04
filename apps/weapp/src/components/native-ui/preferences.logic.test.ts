import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeNativePreferences } from './preferences.logic.ts'

test('old paused GIF defaults migrate while current explicit playback choices are retained', () => {
  assert.equal(normalizeNativePreferences({ autoplayGif: false }).autoplayGif, true)
  assert.equal(
    normalizeNativePreferences({ autoplayGif: false, playbackVersion: 2 }).autoplayGif,
    false,
  )
  assert.deepEqual(normalizeNativePreferences({ reduceMotion: true, largeText: true }), {
    reduceMotion: true,
    largeText: true,
    autoplayGif: true,
  })
})
