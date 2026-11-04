import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeWriteEnabled } from './config.weapp.ts'
const enabledConfig = {
  enabled: true,
  publishPosts: true,
  postComments: true,
  matchComments: true,
  privateMessages: true,
}
import {
  appendEmoji,
  draftStorageKey,
  drawerRelease,
  drawerSpring,
  keyboardViewport,
} from './interaction.logic.weapp.ts'

test('one native master switch disables every newly introduced write feature; individual flags remain independent', () => {
  for (const key of ['publishPosts', 'postComments', 'matchComments', 'privateMessages'] as const) {
    assert.equal(nativeWriteEnabled(key, { ...enabledConfig, enabled: false }), false)
    assert.equal(nativeWriteEnabled(key, { ...enabledConfig, [key]: false }), false)
    assert.equal(nativeWriteEnabled(key, enabledConfig), true)
  }
  assert.equal(
    nativeWriteEnabled('postComments', { ...enabledConfig, privateMessages: false }),
    true,
  )
})
test('keyboard layout avoids subtracting the keyboard twice on Android and handles an overlay keyboard', () => {
  assert.equal(keyboardViewport(800, 500, 300), 500)
  assert.equal(keyboardViewport(800, 800, 300), 500)
  assert.equal(keyboardViewport(800, 800, 0), 800)
  assert.equal(keyboardViewport(800, 500, 0), 500)
})
test('drafts are separated by account, organization, recipient and content type', () => {
  const first = draftStorageKey('org1', 'user1', 'message:recipient1')
  for (const key of [
    draftStorageKey('org2', 'user1', 'message:recipient1'),
    draftStorageKey('org1', 'user2', 'message:recipient1'),
    draftStorageKey('org1', 'user1', 'message:recipient2'),
    draftStorageKey('org1', 'user1', 'post:recipient1'),
  ])
    assert.notEqual(key, first)
})
test('emoji insertion preserves the cursor and never slices a surrogate pair to fit the limit', () => {
  assert.deepEqual(appendEmoji('进球啦', '⚽', 2, 10), { body: '进球⚽啦', cursor: 3 })
  assert.deepEqual(appendEmoji('好球', '😀', -1, 3), { body: '好球', cursor: 2 })
  assert.deepEqual(appendEmoji('好球', '😀', -1, 4), { body: '好球😀', cursor: 4 })
})
test('drawer closes on a decisive drag or flick and returns fully open after a cancelled drag', () => {
  assert.equal(drawerRelease(-40, 0, 300), 0)
  assert.equal(drawerRelease(-110, 0, 300), -300)
  assert.equal(drawerRelease(-30, -800, 300), -300)
  assert.equal(drawerRelease(-120, 600, 300), 0)
})
test('drawer spring preserves release velocity and settles after a suspended timer without slow catch-up', () => {
  assert.deepEqual(drawerSpring(-110, -600, -300, 0), { position: -110, velocity: -600 })
  const open = drawerSpring(-300, 0, 0, 1)
  assert.ok(Math.abs(open.position) < 0.5 && Math.abs(open.velocity) < 5)
  const close = drawerSpring(-110, -600, -300, 2)
  assert.ok(Math.abs(close.position + 300) < 0.5 && Math.abs(close.velocity) < 5)
  const midway = drawerSpring(-300, 0, 0, 0.1)
  assert.ok(midway.position > -300 && midway.position < 0)
})
