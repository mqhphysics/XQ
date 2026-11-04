import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDate, formatTime, formatLongDate } from './product.format.weapp.ts'
test('native dates stay on UTC+8 with compact time and no locale suffix', () => {
  const value = '2026-10-19T18:30:45.000Z'
  assert.equal(formatDate(value), '10/20周二')
  assert.equal(formatTime(value), '02:30')
  assert.equal(formatLongDate(value), '2026年10月20日 周二')
})
test('native date formatting does not depend on broken phone locale support', () => {
  const before = Date.prototype.toLocaleTimeString
  Date.prototype.toLocaleTimeString = () => 'Mon Oct 19 2026 18:30:45 GMT+0000'
  try {
    assert.equal(formatTime('2026-10-19T18:30:45Z'), '02:30')
  } finally {
    Date.prototype.toLocaleTimeString = before
  }
  assert.equal(formatTime('invalid'), '--:--')
})
