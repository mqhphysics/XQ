import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyFocusPreferences, rankFocusMatches, type FocusCandidate } from './focus-matches.logic'
const now = Date.parse('2026-11-08T04:20:00Z')
const match = (id: string, gender = 'MEN', college = '甲学院'): FocusCandidate => ({
  id,
  focusGender: gender,
  status: 'SCHEDULED',
  scheduledStartAt: new Date(now + 3600000).toISOString(),
  homeTeam: { id: id + '-team', collegeName: college },
  awayTeam: null,
})
test('primary team, followed team and verified college receive preference over gender default', () => {
  const men = match('men'),
    women = match('women', 'WOMEN', '乙学院')
  for (const preference of [
    { primaryTeams: ['women-team'] },
    { followedTeams: ['women-team'] },
    { college: '乙学院' },
  ]) {
    assert.equal(
      rankFocusMatches(
        [men, women],
        { ...emptyFocusPreferences(), gender: 'MALE', ...preference },
        now,
      )[0]?.id,
      'women',
    )
  }
})
test('frequent reading of another category overrides weak gender; unknown gender stays neutral', () => {
  const men = match('z-men'),
    women = match('a-women', 'WOMEN')
  const base = emptyFocusPreferences()
  assert.equal(rankFocusMatches([women, men], { ...base, gender: 'MALE' }, now)[0]?.id, men.id)
  assert.equal(rankFocusMatches([men, women], base, now)[0]?.id, women.id)
  assert.equal(
    rankFocusMatches(
      [men, women],
      {
        ...base,
        gender: 'MALE',
        history: [
          {
            teamIds: [],
            gender: 'WOMEN',
            count: 3,
            viewedAt: new Date(now),
          },
        ],
      },
      now,
    )[0]?.id,
    women.id,
  )
})
test('recent team reading matters and interests outside 30 days do not affect ranking', () => {
  const a = match('a'),
    b = match('b')
  const history = [{ teamIds: ['b-team'], gender: '', count: 5, viewedAt: new Date(now) }]
  assert.equal(rankFocusMatches([a, b], { ...emptyFocusPreferences(), history }, now)[0]?.id, 'b')
  history[0]!.viewedAt = new Date(now - 31 * 86400000)
  assert.equal(rankFocusMatches([a, b], { ...emptyFocusPreferences(), history }, now)[0]?.id, 'a')
})
test('current fixtures do not get displaced by a distant primary-team match or cancelled fixtures', () => {
  const live = { ...match('live'), status: 'LIVE' },
    future = { ...match('future'), scheduledStartAt: new Date(now + 90 * 86400000).toISOString() }
  const hidden = ['DRAFT', 'CANCELLED', 'ABANDONED', 'POSTPONED'].map((status) => ({
    ...match(status),
    status,
  }))
  const result = rankFocusMatches(
    [future, ...hidden, live],
    { ...emptyFocusPreferences(), primaryTeams: ['future-team'] },
    now,
  )
  assert.deepEqual(
    result.map((m) => m.id),
    ['live', 'future'],
  )
})
test('off-season returns recent results and removes administrative non-played results', () => {
  const recent = {
    ...match('recent'),
    status: 'FINISHED',
    scheduledStartAt: new Date(now - 10 * 86400000).toISOString(),
  }
  const older = {
    ...match('older'),
    status: 'FINISHED',
    scheduledStartAt: new Date(now - 100 * 86400000).toISOString(),
  }
  assert.deepEqual(
    rankFocusMatches(
      [older, { ...recent, id: 'void', statusReason: '组委会裁定弃权' }, recent],
      emptyFocusPreferences(),
      now,
    ).map((m) => m.id),
    ['recent', 'older'],
  )
})
