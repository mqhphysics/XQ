import assert from 'node:assert/strict'
import test from 'node:test'
import { reportingWindow } from './reporting-window'

test('score entry opens exactly thirty minutes before kickoff and never expires at midnight', () => {
  const start = new Date('2026-11-07T15:40:00Z')
  const rules = { match: { periods: 2, periodMinutes: 30, intervalMinutes: 10 } }
  assert.equal(reportingWindow(start, rules, start.getTime() - 30 * 60000 - 1)!.opened, false)
  assert.equal(reportingWindow(start, rules, start.getTime() - 30 * 60000)!.opened, true)
  assert.equal(reportingWindow(start, rules, Date.parse('2026-11-09T16:00:00Z'))!.opened, true)
  assert.equal(reportingWindow(null, rules), null)
})

test('technical recording closes exactly thirty minutes after the observed end and distinguishes estimates', () => {
  const start = new Date('2026-11-07T04:00:00Z'),
    end = new Date('2026-11-07T05:20:00Z')
  const rules = { match: { periodMinutes: 30, intervalMinutes: 10 } }
  const before = reportingWindow(start, rules, end.getTime() + 30 * 60000 - 1, end)!
  assert.equal(before.technicalOpen, true)
  assert.equal(before.endedAtSource, 'ACTUAL')
  assert.equal(reportingWindow(start, rules, end.getTime() + 30 * 60000, end)!.technicalOpen, false)
  const estimated = reportingWindow(start, rules, start.getTime())!
  assert.equal(estimated.endedAtSource, 'ESTIMATED')
  assert.equal(estimated.technicalClosesAt, start.getTime() + 105 * 60000)
  assert.equal(
    reportingWindow(start, { match: { periodMinutes: 20 } }, start.getTime())!.technicalClosesAt,
    start.getTime() + 85 * 60000,
  )
})
