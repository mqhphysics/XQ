import assert from 'node:assert/strict'
import test from 'node:test'
import { leagueDay, leagueShortDate, leagueTime } from './league-time.ts'
import { formatDate, formatTime } from './product-format.shared.ts'
import {
  formatCompactDate,
  formatDateLabel,
  formatMatchTime,
} from '../readonly-schedule/readonly-schedule.logic.ts'

test('shared schedule and product formatters work when the phone has no locale implementation', () => {
  const date = Date.prototype.toLocaleDateString,
    time = Date.prototype.toLocaleTimeString
  Date.prototype.toLocaleDateString = Date.prototype.toLocaleTimeString = () => {
    throw new Error('locale unavailable')
  }
  try {
    const iso = '2026-10-19T18:30:45.000Z'
    assert.equal(formatDate(iso), '10/20周二')
    assert.equal(formatTime(iso), '02:30')
    assert.equal(formatMatchTime(iso), '02:30')
    assert.equal(formatDateLabel(iso), '10月20日周二')
    assert.equal(formatCompactDate(iso), '10/20')
  } finally {
    Date.prototype.toLocaleDateString = date
    Date.prototype.toLocaleTimeString = time
  }
})
test('zone-less league times are interpreted as UTC+8 rather than the device timezone', () => {
  for (const value of [
    '2026-09-01T19:00:00',
    '2026-09-01 19:00:00',
    '2026-09-01T11:00:00Z',
    '2026-09-01T19:00:00+08:00',
  ]) {
    assert.equal(leagueShortDate(value), '09/01周二')
    assert.equal(leagueTime(value), '19:00')
  }
  assert.equal(leagueDay('2026-09-01'), '09/01')
  assert.equal(leagueTime('not-a-date'), '--:--')
})
