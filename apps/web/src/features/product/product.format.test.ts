import assert from 'node:assert/strict'
import test from 'node:test'

import { formatDate, formatTime } from './product.format.ts'

test('kickoff labels use Asia/Shanghai instead of the device timezone', () => {
  const kickoff = '2026-10-10T16:30:00.000Z'
  assert.match(formatTime(kickoff), /00:30/)
  assert.match(formatDate(kickoff), /11/)
  assert.equal(formatTime(kickoff).includes('16:30'), false)
})
