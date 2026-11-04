import test from 'node:test'
import assert from 'node:assert/strict'
import { createMotionFrame } from './motion-frame.weapp.ts'
test('rapid moves send the latest position once per frame and settled transitions flush without delay', () => {
  let time = 0
  const callbacks: Array<{ at: number; run: () => void; cancelled: boolean }> = [],
    painted: number[] = []
  const writer = createMotionFrame<number>((value) => painted.push(value), {
    now: () => time,
    schedule: (run, delay) => {
      const job = { at: time + delay, run, cancelled: false }
      callbacks.push(job)
      return () => {
        job.cancelled = true
      }
    },
  })
  writer.push(0)
  for (let i = 1; i <= 50; i++) writer.push(i)
  assert.deepEqual(painted, [0])
  assert.equal(callbacks.length, 1)
  time = 16
  callbacks[0]!.run()
  assert.deepEqual(painted, [0, 50])
  writer.push(51)
  writer.push(100, true)
  assert.deepEqual(painted, [0, 50, 100])
  writer.push(101)
  writer.clear()
  for (const job of callbacks) if (!job.cancelled && job.at > time) job.run()
  assert.deepEqual(painted, [0, 50, 100])
})
