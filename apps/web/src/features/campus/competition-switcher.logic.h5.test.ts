import assert from 'node:assert/strict'
import test from 'node:test'

import {
  activePick,
  cupRows,
  defaultPick,
  orderedSeasons,
  pickForIds,
  pickForTournament,
  pickLabel,
  resolvePick,
  seasonLabel,
  tournamentStatus,
  upcomingTitle,
} from './competition-switcher.logic.h5.ts'

const competition = (code: string, cupName: string, gender: string, sortOrder: number) => ({
  id: `c-${code}`,
  code,
  name: cupName,
  cupName,
  gender,
  sortOrder,
})
const catalog = {
  competitions: [
    competition('FRESHMEN_MEN', '新生杯', 'MALE', 0),
    competition('FRESHMEN_WOMEN', '新生杯', 'FEMALE', 1),
    competition('CS_MEN', '计科杯', 'MALE', 2),
    competition('CS_WOMEN', '计科杯', 'FEMALE', 3),
    competition('GREEN_MEN', '绿茵杯', 'MALE', 4),
    competition('GREEN_WOMEN', '绿茵杯', 'FEMALE', 5),
  ],
  seasons: [
    { id: 's-demo', name: '演示赛季', isDemo: true },
    { id: 's-2026', name: '2026', isDemo: false },
  ],
  tournaments: [
    {
      id: 't-green-men',
      seasonId: 's-2026',
      competitionDefinitionId: 'c-GREEN_MEN',
      name: '2026 绿茵杯',
      status: 'PUBLISHED',
    },
  ],
}

test('cup rows follow 绿茵杯, 计科杯, 新生杯 and map to the tournament of the season', () => {
  const rows = cupRows(catalog, 'MALE', 's-2026')
  assert.deepEqual(
    rows.map((row) => [row.cupName, row.tournament?.id ?? null, row.status]),
    [
      ['绿茵杯', 't-green-men', 'live'],
      ['计科杯', null, 'upcoming'],
      ['新生杯', null, 'upcoming'],
    ],
  )
  assert.ok(cupRows(catalog, 'FEMALE', 's-2026').every((row) => row.status === 'upcoming'))
  assert.ok(cupRows(catalog, 'MALE', 's-demo').every((row) => !row.tournament))
})

test('cup + gender + season resolve to one competition, with or without a tournament', () => {
  const men = resolvePick(catalog, '绿茵杯', 'MALE', 's-2026')
  assert.equal(men?.competition.code, 'GREEN_MEN')
  assert.equal(men?.tournament?.id, 't-green-men')
  const women = resolvePick(catalog, '绿茵杯', 'FEMALE', 's-2026')
  assert.equal(women?.competition.code, 'GREEN_WOMEN')
  assert.equal(women?.tournament, undefined)
  assert.equal(resolvePick(catalog, '绿茵杯', 'MALE', 'missing'), undefined)
})

test('a tournament maps back to its competition and season', () => {
  const pick = pickForTournament(catalog, 't-green-men')
  assert.equal(pick?.competition.gender, 'MALE')
  assert.equal(pick?.season.id, 's-2026')
  assert.equal(pickForTournament(catalog, 'unknown'), undefined)
  assert.equal(pickForIds(catalog, 'c-CS_WOMEN', 's-2026')?.tournament, undefined)
})

test('default prefers the route tournament, then the stored pair, then 新生杯男子组 2026 even before publication', () => {
  assert.equal(defaultPick(catalog, {})?.competition.code, 'FRESHMEN_MEN')
  assert.equal(defaultPick(catalog, {})?.season.id, 's-2026')
  const stored = defaultPick(catalog, { competitionId: 'c-GREEN_WOMEN', seasonId: 's-2026' })
  assert.equal(stored?.competition.code, 'GREEN_WOMEN')
  const routed = defaultPick(
    catalog,
    { competitionId: 'c-GREEN_WOMEN', seasonId: 's-2026' },
    't-green-men',
  )
  assert.equal(routed?.competition.code, 'GREEN_MEN')
  const stale = defaultPick(catalog, { competitionId: 'gone', seasonId: 'gone' })
  assert.equal(stale?.competition.code, 'FRESHMEN_MEN')
  assert.equal(stale?.season.id, 's-2026')
})

test('labels, seasons and statuses', () => {
  assert.deepEqual(pickLabel(pickForTournament(catalog, 't-green-men')!), {
    title: '2026 绿茵杯',
    group: '男子组',
  })
  assert.deepEqual(pickLabel(resolvePick(catalog, '计科杯', 'FEMALE', 's-demo')!), {
    title: '演示赛季 计科杯',
    group: '女子组',
  })
  assert.deepEqual(orderedSeasons(catalog).map(seasonLabel), ['2026', '演示赛季'])
  assert.equal(tournamentStatus(undefined), 'upcoming')
  assert.equal(tournamentStatus({ ...catalog.tournaments[0]!, status: 'ARCHIVED' }), 'ended')
})

test('published real tournament becomes the default while an explicit demo choice stays intact', () => {
  const actual = {
    ...catalog,
    tournaments: [
      { ...catalog.tournaments[0]!, id: 't-demo', seasonId: 's-demo' },
      {
        ...catalog.tournaments[0]!,
        id: 't-freshmen',
        competitionDefinitionId: 'c-FRESHMEN_MEN',
        name: '2026 新生杯',
      },
    ],
  }
  assert.equal(defaultPick(actual, {})?.tournament?.id, 't-freshmen')
  assert.equal(
    defaultPick(actual, { competitionId: 'c-GREEN_MEN', seasonId: 's-demo' })?.tournament?.id,
    't-demo',
  )
  assert.equal(defaultPick(actual, {}, 't-demo')?.tournament?.id, 't-demo')
})

test('fallback goes to the active tournament and empty picks get an upcoming title', () => {
  assert.equal(activePick(catalog)?.tournament?.id, 't-green-men')
  const onlyWomen = {
    ...catalog,
    tournaments: [
      { ...catalog.tournaments[0]!, id: 't-cs-w', competitionDefinitionId: 'c-CS_WOMEN' },
    ],
  }
  assert.equal(activePick(onlyWomen)?.competition.code, 'CS_WOMEN')
  assert.equal(activePick({ ...catalog, tournaments: [] }), undefined)
  assert.equal(
    upcomingTitle(resolvePick(catalog, '绿茵杯', 'FEMALE', 's-2026')!),
    '2026 绿茵杯 · 女子组 即将开赛',
  )
})
