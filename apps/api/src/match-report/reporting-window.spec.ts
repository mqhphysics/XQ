import assert from 'node:assert/strict'
import test from 'node:test'
import { reportingWindow } from './reporting-window'

test('reporters may save repeatedly until the post-match final save; midnight always closes their day', () => {
  const start = new Date('2026-10-24T04:20:00Z')
  const rules = { match: { periods: 2, periodMinutes: 30 } }
  assert.equal(reportingWindow(start, rules, start.getTime() - 1)!.started, false)
  const live = reportingWindow(start, rules, Date.parse('2026-10-24T05:55:00Z'))!
  assert.equal(live.started, true)
  assert.equal(live.finalSave, false)
  const final = reportingWindow(start, rules, Date.parse('2026-10-24T06:10:00Z'))!
  assert.equal(final.finalSave, true)
  assert.equal(final.expired, false)
  assert.equal(reportingWindow(start, rules, Date.parse('2026-10-24T16:00:00Z'))!.expired, true)
  assert.equal(reportingWindow(start, rules, Date.parse('2026-10-24T15:59:59Z'))!.expired, false)
  assert.equal(reportingWindow(null, rules), null)
})

test('women and explicit intervals use their own scheduled playing window', () => {
  const start = new Date('2026-10-24T04:20:00Z')
  assert.equal(
    reportingWindow(start, { match: { periodMinutes: 20 } })!.finalizableAt,
    start.getTime() + 80 * 60000,
  )
  assert.equal(
    reportingWindow(start, { match: { periodMinutes: 30, intervalMinutes: 10 } })!.finalizableAt,
    start.getTime() + 100 * 60000,
  )
})
