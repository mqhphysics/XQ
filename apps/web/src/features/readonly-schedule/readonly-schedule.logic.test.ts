import assert from 'node:assert/strict'
import test from 'node:test'

import {
  filterMatches,
  filterTeams,
  findFocusMatch,
  getMatchStatusText,
  getScheduleDateOptions,
  getScheduleStageOptions,
  groupMatchesByDateAndStage,
  sortMatchesByStartAt,
} from './readonly-schedule.logic.ts'
import type { ReadonlyMatch, ReadonlyTeamSummary } from './readonly-schedule.types.ts'
import {
  createBracketLayout,
  filterAndSortSchedule,
  matchDetailUrl,
  teamDetailUrl,
} from '../competition/competition.logic.ts'
import type { MatchSummary } from '../product/product.types.ts'

const matches: ReadonlyMatch[] = [
  createMatch('m-3', '2026-07-02T09:00:00+08:00', '八强赛', 'CANCELLED'),
  createMatch('m-1', '2026-07-01T15:00:00+08:00', '小组赛', 'LIVE'),
  createMatch('m-2', '2026-07-01T10:00:00+08:00', '小组赛', 'SCHEDULED'),
  createMatch('m-4', '2026-07-02T11:00:00+08:00', '小组赛', 'FINISHED'),
]

test('sortMatchesByStartAt orders matches by scheduled time', () => {
  assert.deepEqual(
    sortMatchesByStartAt(matches).map((match) => match.id),
    ['m-2', 'm-1', 'm-3', 'm-4'],
  )
})

test('groupMatchesByDateAndStage groups schedule by date then stage', () => {
  const groups = groupMatchesByDateAndStage(matches)

  assert.equal(groups.length, 2)
  assert.equal(groups[0]?.dateKey, '2026-07-01')
  assert.equal(groups[0]?.stages[0]?.stageName, '小组赛')
  assert.deepEqual(
    groups[0]?.stages[0]?.matches.map((match) => match.id),
    ['m-2', 'm-1'],
  )
  assert.equal(groups[1]?.dateKey, '2026-07-02')
  assert.deepEqual(
    groups[1]?.stages.map((stage) => stage.stageName),
    ['八强赛', '小组赛'],
  )
})

test('getMatchStatusText maps readonly match statuses', () => {
  assert.equal(getMatchStatusText('SCHEDULED'), '未开始')
  assert.equal(getMatchStatusText('LIVE'), '进行中')
  assert.equal(getMatchStatusText('POSTPONED'), '已延期')
  assert.equal(getMatchStatusText('CANCELLED'), '已取消')
  assert.equal(getMatchStatusText('FINISHED'), '已结束')
})

test('schedule filters keep date and stage selection deterministic', () => {
  assert.deepEqual(getScheduleDateOptions(matches), ['2026-07-01', '2026-07-02'])
  assert.deepEqual(getScheduleStageOptions(matches), ['小组赛', '八强赛'])
  assert.deepEqual(
    filterMatches(matches, { dateKey: '2026-07-02', stageName: '小组赛' }).map((match) => match.id),
    ['m-4'],
  )
})

test('team search matches public name, short name and stable team code', () => {
  const teams: ReadonlyTeamSummary[] = [
    createTeam('team-b', '江湾联队', '江湾', 'RIVER-02'),
    createTeam('team-a', '星火学院', '星火', 'SPARK-01'),
  ]

  assert.deepEqual(
    filterTeams(teams, ' spark 01 ').map((team) => team.id),
    ['team-a'],
  )
  assert.deepEqual(
    filterTeams(teams, '江湾').map((team) => team.id),
    ['team-b'],
  )
})

test('focus match prefers live then the next scheduled match', () => {
  assert.equal(findFocusMatch(matches, new Date('2026-07-01T08:00:00+08:00'))?.id, 'm-1')

  const withoutLive = matches.map((match) =>
    match.id === 'm-1' ? { ...match, status: 'FINISHED' as const } : match,
  )
  assert.equal(findFocusMatch(withoutLive, new Date('2026-07-01T08:00:00+08:00'))?.id, 'm-2')
})

test('competition schedule keeps all, upcoming and finished filters deterministic', () => {
  const competitionMatches = [
    createCompetitionMatch('finished', '2026-09-01T12:00:00+08:00', 'FINISHED'),
    createCompetitionMatch('confirmed', '2026-09-02T12:00:00+08:00', 'CONFIRMED'),
    createCompetitionMatch('scheduled', '2026-09-03T12:00:00+08:00', 'SCHEDULED'),
    createCompetitionMatch('postponed', '2026-09-04T12:00:00+08:00', 'POSTPONED'),
    createCompetitionMatch('live', '2026-09-05T12:00:00+08:00', 'LIVE'),
  ]

  assert.deepEqual(
    filterAndSortSchedule(competitionMatches, 'all', 'asc').map((match) => match.id),
    ['finished', 'confirmed', 'scheduled', 'postponed', 'live'],
  )
  assert.deepEqual(
    filterAndSortSchedule(competitionMatches, 'upcoming', 'asc').map((match) => match.id),
    ['scheduled', 'postponed'],
  )
  assert.deepEqual(
    filterAndSortSchedule(competitionMatches, 'finished', 'desc').map((match) => match.id),
    ['confirmed', 'finished'],
  )
})

test('schedule card and team areas resolve separate destinations and stop bubbling', () => {
  assert.equal(
    matchDetailUrl('match / 1'),
    '/pages/readonly-match-detail/index?matchId=match%20%2F%201',
  )

  let stopped = 0
  const event = { stopPropagation: () => (stopped += 1) }
  assert.equal(
    teamDetailUrl(event, 'team / 1', 'tournament / 1'),
    '/pages/readonly-team-detail/index?teamId=team%20%2F%201&tournamentId=tournament%20%2F%201',
  )
  assert.equal(stopped, 1)
  assert.equal(teamDetailUrl(event, null, 'tournament / 1'), null)
  assert.equal(stopped, 1)
})

test('bracket layout connects a 16-team champion path and isolates third place', () => {
  const rounds = [
    bracketRound('r16', '十六强', 8),
    bracketRound('qf', '八强', 4),
    bracketRound('sf', '半决赛', 2),
    {
      id: 'finals',
      name: '决赛日',
      matches: [
        { id: 'final-1', matchCode: 'GC26-FINAL' },
        { id: 'third-1', matchCode: 'GC26-THIRD' },
      ],
    },
  ]
  const layout = createBracketLayout(rounds)

  assert.deepEqual(
    layout.rounds.map((round) => round.name),
    ['十六强', '八强', '半决赛', '决赛日'],
  )
  assert.equal(layout.nodes.filter((node) => node.roundIndex === 0).length, 8)
  assert.equal(layout.nodes.filter((node) => node.roundIndex === 1).length, 4)
  assert.equal(layout.nodes.filter((node) => node.roundIndex === 2).length, 2)
  assert.equal(layout.nodes.find((node) => node.matchId === 'third-1')?.placement, true)
  assert.equal(
    layout.connectors.some((connector) => connector.targetMatchId === 'third-1'),
    false,
  )

  for (const connector of layout.connectors) {
    assert.ok(connector.width >= 0)
    assert.ok(connector.height >= 0)
  }
})

function createMatch(
  id: string,
  scheduledStartAt: string,
  stageName: string,
  status: ReadonlyMatch['status'],
): ReadonlyMatch {
  return {
    id,
    tournamentId: 'tournament-1',
    stageName,
    roundName: '第 1 轮',
    scheduledStartAt,
    venueName: '东区足球场',
    pitchName: '1 号场',
    homeTeamId: 'team-a',
    awayTeamId: 'team-b',
    homeTeamName: '主队',
    awayTeamName: '客队',
    status,
  }
}

function createTeam(
  id: string,
  name: string,
  shortName: string,
  teamCode: string,
): ReadonlyTeamSummary {
  return {
    id,
    tournamentId: 'tournament-1',
    teamCode,
    name,
    shortName,
    registrationStatus: 'APPROVED',
    rosterStatus: 'LOCKED',
    rosterPlayerCount: 18,
  }
}

function createCompetitionMatch(
  id: string,
  scheduledStartAt: string,
  status: MatchSummary['status'],
): MatchSummary {
  return {
    id,
    tournamentId: 'tournament-1',
    matchCode: id,
    title: id,
    status,
    scheduledStartAt,
    homeTeam: null,
    awayTeam: null,
    homeScore: null,
    awayScore: null,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    statusReason: null,
    venue: null,
  }
}

function bracketRound(id: string, name: string, count: number) {
  return {
    id,
    name,
    matches: Array.from({ length: count }, (_, index) => ({
      id: `${id}-${index + 1}`,
      matchCode: `GC26-${id.toUpperCase()}-${String(index + 1).padStart(2, '0')}`,
    })),
  }
}
