import assert from 'node:assert/strict'
import test from 'node:test'
import {
  nativeFocusLabel,
  nativeFocusMatches,
  nativeFocusValue,
  nativeAnnouncements,
  nativeFocusTournaments,
} from './home-display.logic.weapp.ts'
import type {
  HomeResponse,
  MatchSummary,
  PostSummary,
} from '../../features/product/product.types.ts'
test('all platform and tournament announcements stay available in newest-first order without duplicates', () => {
  const post = (id: string, publishedAt: string) => ({ id, publishedAt }) as PostSummary
  const home = {
    announcements: [post('cup-old', '2026-10-01T10:00:00Z'), post('same', '2026-10-18T10:00:00Z')],
    platformAnnouncements: [
      post('platform-new', '2026-10-20T10:00:00Z'),
      post('same', '2026-10-18T10:00:00Z'),
    ],
  } as HomeResponse
  assert.deepEqual(
    nativeAnnouncements(home).map((item) => item.id),
    ['platform-new', 'same', 'cup-old'],
  )
  assert.equal(home.announcements.length, 2)
})
const match = (id: string, changes: Partial<MatchSummary> = {}): MatchSummary => ({
  id,
  tournamentId: 'fictional',
  matchCode: id,
  title: '半决赛 1',
  status: 'SCHEDULED',
  scheduledStartAt: '2026-09-01T11:00:00Z',
  homeTeam: null,
  awayTeam: null,
  homeScore: null,
  awayScore: null,
  homePenaltyScore: null,
  awayPenaltyScore: null,
  statusReason: null,
  venue: null,
  ...changes,
})
test('unscored focus games show kickoff date and time on the league clock, while zero stays a score', () => {
  assert.equal(nativeFocusValue(match('upcoming')), '09/01\n19:00')
  assert.equal(
    nativeFocusValue(match('midnight', { scheduledStartAt: '2026-09-01T16:30:00Z' })),
    '09/02\n00:30',
  )
  assert.equal(nativeFocusValue(match('draw', { homeScore: 0, awayScore: 0 })), '0 : 0')
  assert.equal(nativeFocusValue(match('unknown', { scheduledStartAt: null })), '待定')
})
test('focus captions keep the compact group or knockout round without tournament years', () => {
  assert.equal(nativeFocusLabel(match('semi')), '半决赛')
  assert.equal(
    nativeFocusLabel(
      match('group', {
        title: '新生杯（男足）·2026·小组赛第3轮',
        roundName: '小组赛',
        groupName: 'B组',
      }),
    ),
    '男足 · B组第3轮',
  )
})

test('focus captions show only the gender and round, without cup name or brackets', () => {
  assert.equal(
    nativeFocusLabel({
      ...match('group', {
        title: '2026 新生杯 小组赛第3轮',
        groupName: 'B组',
        roundName: '小组赛',
      }),
      focusCupName: '新生杯',
      focusGender: 'MALE',
    }),
    '男足 · B组第3轮',
  )
  assert.equal(
    nativeFocusLabel({
      ...match('final', { title: '女足决赛', roundName: '决赛' }),
      focusCupName: '新生杯',
      focusGender: 'FEMALE',
    }),
    '女足 · 决赛',
  )
})
test('focus always uses at most two real games and fills a completed tournament without duplicates', () => {
  const recent = match('recent', { status: 'FINISHED', homeScore: 0, awayScore: 0 }),
    older = match('older', {
      status: 'FINISHED',
      homeScore: 1,
      awayScore: 0,
      scheduledStartAt: '2026-08-30T02:00:00Z',
    }),
    upcoming = match('upcoming', { scheduledStartAt: '2026-09-02T11:00:00Z' })
  assert.deepEqual(
    nativeFocusMatches([older, recent, upcoming], Date.parse('2026-09-01T13:00:00Z')).map(
      (item) => item.id,
    ),
    ['recent', 'upcoming'],
  )
  assert.deepEqual(
    nativeFocusMatches([older, recent]).map((item) => item.id),
    ['recent', 'older'],
  )
})
test('live or scoreless ended games do not replace the latest scored result or the next kickoff', () => {
  const now = Date.parse('2026-10-27T02:00:00Z')
  const rows = [
    match('live', { status: 'LIVE' }),
    match('unknown', { status: 'FINISHED', scheduledStartAt: '2026-10-27T01:00:00Z' }),
    match('result', { status: 'FINISHED', homeScore: 2, awayScore: 1 }),
    match('soon', { scheduledStartAt: '2026-10-27T03:00:00Z' }),
    match('later', { scheduledStartAt: '2026-10-28T03:00:00Z' }),
  ]
  assert.deepEqual(
    nativeFocusMatches(rows, now).map((m) => m.id),
    ['result', 'soon'],
  )
})
test('after every game ends the mens and womens finals remain, excluding semi and third place', () => {
  const rows = [
    {
      ...match('men', {
        status: 'FINISHED',
        homeScore: 2,
        awayScore: 1,
        title: '决赛',
        roundName: '决赛',
        scheduledStartAt: '2026-10-28T03:00:00Z',
      }),
      focusGender: 'MEN',
    },
    {
      ...match('women', {
        status: 'FINISHED',
        homeScore: 1,
        awayScore: 0,
        title: '决赛',
        roundName: '决赛',
        scheduledStartAt: '2026-10-27T03:00:00Z',
      }),
      focusGender: 'WOMEN',
    },
    {
      ...match('semi', {
        status: 'FINISHED',
        homeScore: 3,
        awayScore: 1,
        scheduledStartAt: '2026-10-29T03:00:00Z',
      }),
      focusGender: 'MEN',
    },
    match('third', {
      status: 'FINISHED',
      homeScore: 2,
      awayScore: 0,
      title: '季军赛',
      roundName: '季军赛',
      scheduledStartAt: '2026-10-30T03:00:00Z',
    }),
  ]
  assert.deepEqual(
    nativeFocusMatches(rows).map((m) => m.id),
    ['men', 'women'],
  )
  assert.equal(nativeFocusLabel(rows[0]!), '男足 · 决赛')
  assert.equal(nativeFocusValue(match('no-score', { status: 'FINISHED' })), '待补比分')
})
test('counterpart focus schedules stay in the selected cup and season', () => {
  const catalog = {
    competitions: [
      { id: 'men', cupName: '新生杯', gender: 'MEN' },
      { id: 'women', cupName: '新生杯', gender: 'WOMEN' },
      { id: 'green', cupName: '绿茵杯', gender: 'MEN' },
    ],
    tournaments: [
      { id: 'a', seasonId: '2026', competitionDefinitionId: 'men', status: 'PUBLISHED' },
      { id: 'b', seasonId: '2026', competitionDefinitionId: 'women', status: 'PUBLISHED' },
      { id: 'old', seasonId: '2025', competitionDefinitionId: 'women', status: 'PUBLISHED' },
      { id: 'other', seasonId: '2026', competitionDefinitionId: 'green', status: 'PUBLISHED' },
    ],
  } as Parameters<typeof nativeFocusTournaments>[0]
  assert.deepEqual(
    nativeFocusTournaments(catalog, 'a').map((t) => t.id),
    ['a', 'b'],
  )
})
