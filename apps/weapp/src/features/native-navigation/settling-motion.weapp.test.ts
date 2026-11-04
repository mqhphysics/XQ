import assert from 'node:assert/strict'
import test from 'node:test'
import { createSettlingMotion, swipeDestination } from './settling-motion.weapp.ts'

test('a deliberate drag near half a page commits; taps and vertical gestures are handled upstream', () => {
  for (const distance of [0.28, 0.4, 0.49])
    assert.equal(swipeDestination(1, 1 + distance, 0, 390, -1, 3), 2)
  assert.equal(swipeDestination(1, 1.08, 0, 390, -1, 3), 1)
  assert.equal(swipeDestination(1, 1.1, 0.7, 390, -1, 3), 2)
  assert.equal(swipeDestination(1, 1.4, -0.7, 390, -1, 3), 0)
  assert.equal(swipeDestination(-1, -1.4, -0.7, 390, -1, 3), -1)
  assert.equal(swipeDestination(3, 3.5, 0.8, 390, -1, 3), 3)
})
test('render latency does not consume settling duration; easing slows smoothly to the target', () => {
  let time = 0
  const frames: Array<() => void> = [],
    drawn: Array<[number, number]> = []
  const motion = createSettlingMotion(
    (p, d) => drawn.push([p, d]),
    (cb) => frames.push(cb),
    () => time,
  )
  motion.drag(0)
  motion.animate(1)
  time = 280
  frames.shift()!()
  assert.equal(drawn.at(-1)![1], 300)
  assert.equal(motion.position(), 0)
  time += 100
  const a = motion.position()
  time += 100
  const b = motion.position()
  time += 100
  const c = motion.position()
  assert.ok(a > 0 && a < 1 && b > a)
  assert.ok(b - a < a)
  assert.ok(c - b < b - a)
  assert.equal(c, 1)
})
test('new gestures and navigation invalidate queued old targets without snapping back', () => {
  let time = 0
  const frames: Array<() => void> = [],
    drawn: Array<[number, number]> = []
  const motion = createSettlingMotion(
    (p, d) => drawn.push([p, d]),
    (cb) => frames.push(cb),
    () => time,
  )
  motion.drag(0)
  motion.animate(1)
  motion.drag(0.25)
  frames.shift()!()
  assert.deepEqual(drawn.at(-1), [0.25, 0])
  motion.animate(1)
  frames.shift()!()
  time = 90
  const from = motion.position()
  motion.animate(0)
  assert.equal(motion.position(), from)
  motion.cancel()
  frames.shift()!()
  assert.equal(motion.position(), from)
})
