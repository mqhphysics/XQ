import assert from 'node:assert/strict'
import test from 'node:test'
import {
  sortReporterMatches,
  reporterMatchKind,
  reporterMatchLabel,
} from './reporter-matches.logic.weapp.ts'
const item = (
  id: string,
  status: string,
  date: string,
  homeScore: number | null = null,
  awayScore: number | null = null,
) => ({
  id,
  status,
  scheduledStartAt: date,
  homeScore,
  awayScore,
  recordingComplete: id === 'done',
})
test('live games come first, followed by missing results, upcoming games, and completed recorded games', () => {
  const matches = [
    item('done', 'FINISHED', '2026-10-27', 0, 0),
    item('future', 'SCHEDULED', '2026-10-29'),
    item('missing-old', 'FINISHED', '2026-10-25'),
    item('missing-new', 'FINISHED', '2026-10-27'),
    item('live', 'LIVE', '2026-10-28', 1, 0),
  ]
  assert.deepEqual(
    sortReporterMatches(matches).map((row) => row.id),
    ['live', 'missing-new', 'missing-old', 'future', 'done'],
  )
  assert.equal(reporterMatchKind(matches[0]!), 'recorded')
  assert.equal(reporterMatchKind(matches[4]!), 'live')
  assert.equal(reporterMatchLabel(matches[3]!), '已结束 · 待录入')
  assert.equal(reporterMatchKind({ ...matches[0]!, recordingComplete: false }), 'pending')
  assert.equal(matches[0]!.id, 'done')
})
