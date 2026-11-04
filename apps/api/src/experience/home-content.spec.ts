import assert from 'node:assert/strict'
import test from 'node:test'
import {
  competitionAnnouncementKey,
  featuredHomeMatches,
  homeContent,
  periodMinutes,
} from './home-content'
test('today results stay ahead of future games and live matches are never duplicated', () => {
  const rows = [
    { id: 'future', status: 'SCHEDULED', scheduledStartAt: new Date('2026-10-22T04:20Z') },
    { id: 'result', status: 'FINISHED', scheduledStartAt: new Date('2026-10-21T04:20Z') },
    { id: 'live', status: 'LIVE', scheduledStartAt: new Date('2026-10-21T06:20Z') },
  ]
  assert.deepEqual(
    featuredHomeMatches(rows, new Date('2026-10-21T07:00Z')).map((m) => m.id),
    ['live', 'result', 'future'],
  )
})

test('adjudicated fixtures stay accessible in the schedule and do not occupy home focus slots', () => {
  const rows = [
    {
      id: 'ruling',
      status: 'FINISHED',
      scheduledStartAt: new Date('2026-10-24T04:20Z'),
      statusReason: '组委会裁定：判负',
    },
    {
      id: 'regular',
      status: 'SCHEDULED',
      scheduledStartAt: new Date('2026-10-24T04:20Z'),
      statusReason: null,
    },
  ]
  assert.deepEqual(
    featuredHomeMatches(rows, new Date('2026-10-24T04:30Z')).map((m) => m.id),
    ['regular'],
  )
})
test('event timelines use the adopted half length and keep legacy demo fallback', () => {
  assert.equal(periodMinutes({ match: { periodMinutes: 20 } }), 20)
  assert.equal(periodMinutes({ match: { periodMinutes: 30 } }), 30)
  assert.equal(periodMinutes(null), 45)
  assert.equal(periodMinutes({ match: { periodMinutes: -1 } }), 45)
})
test('mens and womens tournament announcements share one cup/season key', () => {
  assert.equal(
    competitionAnnouncementKey('FRESHMEN_MEN-2026-SEASON', '2026-SEASON'),
    competitionAnnouncementKey('FRESHMEN_WOMEN-2026-SEASON', '2026-SEASON'),
  )
  assert.notEqual(
    competitionAnnouncementKey('CS_MEN-2026-SEASON', '2026-SEASON'),
    competitionAnnouncementKey('FRESHMEN_MEN-2026-SEASON', '2026-SEASON'),
  )
})
test('match bulletins stay in the feed while official announcements occupy three hero slots', () => {
  const reports = Array.from({ length: 3 }, (_, i) => ({
    id: `report-${i}`,
    type: 'OFFICIAL',
    tags: [{ key: `match-report:${i}` }],
  }))
  const examples = Array.from({ length: 3 }, (_, i) => ({
    id: `example-${i}`,
    type: 'COMMUNITY',
    tags: [],
  }))
  const announcements = Array.from({ length: 3 }, (_, i) => ({
    id: `notice-${i}`,
    type: 'OFFICIAL',
    tags: [{ key: 'competition-announcement:FRESHMEN:2026-SEASON' }],
  }))
  const result = homeContent([...reports, ...announcements, ...examples])
  assert.deepEqual(
    result.announcements.map((p) => p.id),
    announcements.map((p) => p.id),
  )
  assert.equal(result.feed.length, 6)
  assert.equal(result.feed.filter((p) => p.type === 'OFFICIAL').length, 3)
})
