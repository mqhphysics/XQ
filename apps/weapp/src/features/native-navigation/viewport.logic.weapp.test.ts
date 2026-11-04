import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeWideViewport, nativeWideWindow } from './viewport.logic.weapp.ts'
test('the wide structure follows the window width only, matching the 520px CSS media query', () => {
  assert.equal(nativeWideViewport(390), false)
  assert.equal(nativeWideViewport(430), false)
  assert.equal(nativeWideViewport(519), false)
  assert.equal(nativeWideViewport(520), true)
  assert.equal(nativeWideViewport(673), true)
  assert.equal(nativeWideViewport(844), true)
  assert.equal(nativeWideViewport(0), false)
  /* Android split screen: a narrow half keeps the phone layout even on a tall foldable screen. */
  assert.equal(nativeWideWindow({ windowWidth: 432 }), false)
  assert.equal(nativeWideWindow({ windowWidth: 600 }), true)
})
