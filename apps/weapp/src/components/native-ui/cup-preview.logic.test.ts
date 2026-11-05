import assert from 'node:assert/strict'
import test from 'node:test'
import { cupPreview, cupQualifyingPlaces, qualifiedCupTeams } from './cup-preview.logic.ts'
import type {
  CompetitionDataResponse,
  MatchSummary,
  StandingRow,
  TeamSummary,
} from '../../features/product/product.types'

function groupCup(): CompetitionDataResponse {
  const teams = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, shortName: id }) as TeamSummary)
  const matches: MatchSummary[] = []
  for (let home = 0; home < 4; home++)
    for (let away = home + 1; away < 4; away++)
      matches.push({
        id: `${home}-${away}`,
        tournamentId: 'cup',
        matchCode: `${home}-${away}`,
        title: 'group',
        status: 'SCHEDULED',
        homeTeam: teams[home]!,
        awayTeam: teams[away]!,
        homeScore: null,
        awayScore: null,
        homePenaltyScore: null,
        awayPenaltyScore: null,
        scheduledStartAt: null,
        statusReason: null,
        venue: null,
        stageType: 'GROUP',
        groupName: 'A组',
      })
  return {
    tournament: { id: 'cup', name: '新生杯（男足）', seasonName: '2026', status: 'PUBLISHED' },
    groups: [
      {
        id: 'A',
        name: 'A组',
        standings: teams.map(
          (t) => ({ teamId: t.id, points: 0, rank: 1, played: 0, isLive: false }) as StandingRow,
        ),
      },
    ],
    schedule: matches,
    bracket: [],
    seasons: [],
    leaders: { scorers: [], assists: [] },
    updatedAt: '',
  }
}
function win(data: CompetitionDataResponse, h: string, a: string) {
  const match = data.schedule.find((m) => m.homeTeam?.id === h && m.awayTeam?.id === a)!
  match.status = 'FINISHED'
  match.homeScore = 1
  match.awayScore = 0
  const row = data.groups[0]!.standings.find((r) => r.teamId === h)!
  row.points += 3
  row.played++
  data.groups[0]!.standings.find((r) => r.teamId === a)!.played++
}
test('qualification is locked before all group games, with ranking left open until determined', () => {
  const data = groupCup()
  assert.deepEqual(qualifiedCupTeams(data), [])
  win(data, 'a', 'c')
  win(data, 'a', 'd')
  win(data, 'b', 'c')
  win(data, 'b', 'd')
  const qualified = qualifiedCupTeams(data)
  assert.deepEqual(
    qualified.map((q) => [q.team.id, q.rank]),
    [
      ['a', null],
      ['b', null],
    ],
  )
  win(data, 'a', 'b')
  assert.deepEqual(
    qualifiedCupTeams(data).map((q) => [q.team.id, q.rank]),
    [
      ['a', 1],
      ['b', 2],
    ],
  )
})
test('live points, unfinished score reports and an incomplete fixture list cannot certify a team', () => {
  const data = groupCup()
  win(data, 'a', 'c')
  win(data, 'a', 'd')
  win(data, 'b', 'c')
  win(data, 'b', 'd')
  data.groups[0]!.standings[0]!.isLive = true
  assert.deepEqual(qualifiedCupTeams(data), [])
  data.groups[0]!.standings[0]!.isLive = false
  const pending = data.schedule.find((m) => m.homeTeam?.id === 'a' && m.awayTeam?.id === 'c')!
  pending.homeScore = null
  data.groups[0]!.standings[0]!.points -= 3
  assert.deepEqual(qualifiedCupTeams(data), [])
  data.schedule.pop()
  assert.deepEqual(qualifiedCupTeams(data), [])
})
test('read-only crossing preview uses fixed known ranks and preserves the published bracket', () => {
  const data = groupCup()
  win(data, 'a', 'c')
  win(data, 'a', 'd')
  win(data, 'b', 'c')
  win(data, 'b', 'd')
  win(data, 'a', 'b')
  data.groups.push(...['B', 'C', 'D'].map((id) => ({ id, name: id + '组', standings: [] })))
  const before = JSON.stringify(data)
  const view = cupPreview(data)
  assert.equal(view.preview, true)
  assert.equal(view.bracket[0]!.matches[0]!.homeTeam?.id, 'a')
  assert.equal(view.bracket[0]!.matches[2]!.awayTeam?.id, 'b')
  assert.deepEqual(
    view.bracket[0]!.matches.map((m) => [m.homePlaceholder, m.awayPlaceholder]),
    [
      ['A组第1', 'B组第2'],
      ['C组第1', 'D组第2'],
      ['B组第1', 'A组第2'],
      ['D组第1', 'C组第2'],
    ],
  )
  assert.ok(view.bracket.flatMap((r) => r.matches).every((m) => m.id.startsWith('preview:')))
  assert.equal(JSON.stringify(data), before)
  data.bracket = [{ id: 'published', name: '半决赛', number: 1, matches: [data.schedule[0]!] }]
  assert.equal(cupPreview(data).bracket, data.bracket)
  assert.equal(cupPreview(data).preview, false)
})
test('four groups feeding two semifinals qualify only each group winner', () => {
  const data = groupCup()
  data.groups.push(...['B', 'C', 'D'].map((id) => ({ id, name: id + '组', standings: [] })))
  data.bracket = [
    { id: 'semi', name: '半决赛', number: 1, matches: [data.schedule[0]!, data.schedule[1]!] },
  ]
  assert.equal(cupQualifyingPlaces(data), 1)
  win(data, 'a', 'c')
  win(data, 'a', 'd')
  win(data, 'b', 'c')
  win(data, 'b', 'd')
  assert.deepEqual(qualifiedCupTeams(data), [])
  win(data, 'a', 'b')
  assert.deepEqual(
    qualifiedCupTeams(data).map((q) => q.team.id),
    ['a'],
  )
})
test('publishing the quarterfinals keeps their real IDs and fills future rounds as read-only slots', () => {
  const data = groupCup()
  const matches = data.schedule.slice(0, 4)
  data.bracket = [{ id: 'quarter', name: '八强', number: 3, matches }]
  const before = JSON.stringify(data)
  const view = cupPreview(data)
  assert.deepEqual(
    view.bracket.map((r) => r.matches.length),
    [4, 2, 1],
  )
  assert.equal(view.bracket[0]!.matches[0], matches[0])
  assert.ok(view.bracket[1]!.matches.every((m) => 'preview' in m && m.preview))
  assert.equal(JSON.stringify(data), before)
})
