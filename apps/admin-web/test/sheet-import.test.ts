import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMatchSheet, sheetPrompt } from '../src/features/adminWorkflows/sheet-import.logic.ts'
import { genericSheetPrompt } from '../src/features/adminWorkflows/generic-sheet-prompt.ts'
import type { ReportWorkspace } from '../src/features/adminWorkflows/types.ts'

const workspace = {
  matchId: 'fixture-match',
  homeTeam: {
    name: '示例主队',
    players: [
      { id: 'home-7', displayName: '示例甲', shirtNumber: '7' },
      { id: 'home-8', displayName: '示例乙', shirtNumber: '8' },
    ],
  },
  awayTeam: {
    name: '示例客队',
    players: [{ id: 'away-7', displayName: '示例丙', shirtNumber: '7' }],
  },
} as ReportWorkspace
function source(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    matchId: 'fixture-match',
    homeTeam: '示例主队',
    awayTeam: '示例客队',
    homeScore: 1,
    awayScore: 0,
    events: [{ kind: 'GOAL', side: 'HOME', minute: 12, shirtNumber: '7', playerName: '示例甲' }],
    ...overrides,
  })
}
test('sheet preview binds the selected match and its frozen team roster, preserving side', () => {
  const result = parseMatchSheet('```json\n' + source() + '\n```', workspace)
  assert.equal(result.fields.events[0]?.playerId, 'home-7')
  assert.deepEqual(result.warnings, [])
  assert.throws(
    () => parseMatchSheet(source({ matchId: 'different-match' }), workspace),
    /比赛编号/,
  )
  assert.throws(
    () => parseMatchSheet(source({ homeTeam: '示例客队', awayTeam: '示例主队' }), workspace),
    /主客队/,
  )
})
test('same shirt on the other side cannot resolve to a foreign player', () => {
  const result = parseMatchSheet(
    source({
      homeScore: 0,
      awayScore: 1,
      events: [{ kind: 'GOAL', side: 'AWAY', minute: 5, shirtNumber: '7' }],
    }),
    workspace,
  )
  assert.equal(result.fields.events[0]?.playerId, 'away-7')
  const skipped = parseMatchSheet(
    source({
      events: [{ kind: 'GOAL', side: 'HOME', minute: 2, shirtNumber: '7', playerName: '示例丙' }],
    }),
    workspace,
  )
  assert.equal(skipped.fields.events.length, 0)
  assert(skipped.warnings.some((warning) => warning.includes('未能在本队名单匹配')))
})
test('unknown time stays empty and partial goal coverage is explicit', () => {
  const result = parseMatchSheet(
    source({
      homeScore: 2,
      events: [{ kind: 'GOAL', side: 'HOME', minute: null, shirtNumber: '7' }],
    }),
    workspace,
  )
  assert.equal(result.fields.events[0]?.minute, '')
  assert.equal(result.warnings.length, 2)
  assert(!result.eventLabels[0]?.includes('0′'))
})
test('ambiguous shirts require a name, never a global name match or new player', () => {
  const duplicate = {
    ...workspace,
    homeTeam: {
      ...workspace.homeTeam,
      players: [
        ...workspace.homeTeam.players,
        { id: 'other-7', displayName: '示例丁', shirtNumber: '7' },
      ],
    },
  }
  assert.throws(
    () =>
      parseMatchSheet(
        source({ events: [{ kind: 'GOAL', side: 'HOME', minute: 2, shirtNumber: '7' }] }),
        duplicate,
      ),
    /唯一匹配/,
  )
  assert.equal(parseMatchSheet(source(), duplicate).fields.events[0]?.playerId, 'home-7')
})
test('unknown fields, unsafe scores and malformed event types cannot produce a command', () => {
  for (const overrides of [
    { homeScore: -1 },
    { awayScore: 100 },
    { authorUserId: 'someone' },
    { events: [{ kind: 'GRANT_ROLE', side: 'HOME', minute: 1 }] },
  ])
    assert.throws(() => parseMatchSheet(source(overrides), workspace))
  assert.throws(() => parseMatchSheet('not JSON', workspace), /JSON/)
  assert.throws(
    () =>
      parseMatchSheet(
        source({ events: [{ kind: 'GOAL', side: 'HOME', minute: 121, shirtNumber: '7' }] }),
        workspace,
      ),
    /分钟/,
  )
})
test('single-match prompt reuses batch reading and bulletin rules with this match roster', () => {
  const prompt = sheetPrompt(workspace)
  assert(prompt.startsWith(genericSheetPrompt))
  assert(prompt.includes('主队：示例主队') && prompt.includes('客队：示例客队'))
  assert(prompt.includes('7 示例甲') && prompt.includes('7 示例丙'))
  assert(!prompt.includes('fixture-match'))
})

test('only explicitly checked players become starters, with partial counts retained for review', () => {
  const result = parseMatchSheet(
    source({ starters: { HOME: [{ shirtNumber: '7', playerName: '示例甲' }], AWAY: [] } }),
    workspace,
  )
  assert.deepEqual(result.starters, { HOME: ['home-7'], AWAY: [] })
  assert.match(result.fields.notes, /主队勾选首发：示例甲/)
  assert.match(result.starterWarnings[0]!, /仅识别到1名/)
  assert.deepEqual(result.warnings, [])
  assert.throws(
    () =>
      parseMatchSheet(
        source({ starters: { HOME: [{ shirtNumber: '7' }, { shirtNumber: '7' }], AWAY: [] } }),
        workspace,
      ),
    /重复/,
  )
  const partial = parseMatchSheet(
    source({ starters: { HOME: [{ shirtNumber: '9', playerName: '名单外' }], AWAY: [] } }),
    workspace,
  )
  assert.deepEqual(partial.starters, { HOME: [], AWAY: [] })
  assert(partial.starterWarnings.some((warning) => warning.includes('未能在本队名单匹配')))
})

test('generic batch output binds by teams without database ids and rejects ambiguous or critical missing data', () => {
  const document = {
    homeTeam: workspace.homeTeam.name,
    awayTeam: workspace.awayTeam.name,
    homeScore: 1,
    awayScore: 0,
    events: [{ kind: 'GOAL', side: 'HOME', minute: 3, shirtNumber: '7' }],
    warnings: ['助攻未记录'],
    bulletin: { title: '比赛快报', body: '主队1:0获胜。' },
  }
  const result = parseMatchSheet(
    JSON.stringify([{ ...document, homeTeam: '另一支队' }, document]),
    workspace,
  )
  assert.equal(result.fields.homeScore, '1')
  assert(result.warnings.includes('助攻未记录'))
  assert.equal(result.bulletin?.title, '比赛快报')
  assert.throws(() => parseMatchSheet(JSON.stringify([document, document]), workspace), /唯一匹配/)
  assert.throws(
    () => parseMatchSheet(JSON.stringify({ ...document, homeScore: null }), workspace),
    /最终比分未识别/,
  )
  assert.throws(
    () => parseMatchSheet(JSON.stringify({ ...document, matchId: 'wrong-match' }), workspace),
    /比赛编号/,
  )
})
