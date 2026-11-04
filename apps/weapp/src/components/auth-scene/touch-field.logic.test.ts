import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceTouchParticle,
  canvasTouchPosition,
  loginViewportHeight,
  touchRepulsion,
} from './touch-field.logic.ts'

test('native and simulator touch coordinates map to the canvas without non-finite particles', () => {
  const bounds = { left: 14, top: 47 }
  assert.deepEqual(canvasTouchPosition({ x: 40, y: 50 }, bounds), [40, 50])
  assert.deepEqual(canvasTouchPosition({ clientX: 54, clientY: 97 }, bounds), [40, 50])
  assert.equal(canvasTouchPosition({}, bounds), null)
})

test('touch repels source fragments locally and has a stable finite centre direction', () => {
  assert.deepEqual(touchRepulsion(150, 0, 90, 1), [0, 0])
  const [x, y] = touchRepulsion(20, 0, 90, 1)
  assert.ok(x > 0)
  assert.equal(y, 0)
  assert.ok(touchRepulsion(0, 0, 90, 1).every(Number.isFinite))
})

test('a displaced fragment returns to its original position after finger release', () => {
  const point = { x: 0, y: 0, vx: 0, vy: 0 }
  for (let frame = 0; frame < 20; frame++) advanceTouchParticle(point, 60, -30, 1 / 60)
  assert.ok(point.x > 40 && point.y < -20)
  for (let frame = 0; frame < 120; frame++) advanceTouchParticle(point, 0, 0, 1 / 60)
  assert.deepEqual(point, { x: 0, y: 0, vx: 0, vy: 0 })
})

test('keyboard layout does not subtract keyboard height twice on resized Android windows', () => {
  assert.equal(loginViewportHeight(844, 844, 0), 844)
  assert.equal(loginViewportHeight(844, 844, 320), 524)
  assert.equal(loginViewportHeight(524, 844, 320), 524)
})
