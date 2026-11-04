import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEMO_GROUP_CODES,
  DEMO_MATCHES,
  DEMO_PLAYERS,
  DEMO_POSTS,
  DEMO_TEAMS,
  DEMO_TOURNAMENT_TEAMS,
  isPlatformDemoPost,
  type DemoMatchDefinition,
} from './demo-fixture'
import { calculateStandings } from '../experience/ranking'
import {
  DEMO_STARTERS_PER_TEAM,
  competitionRules,
  getDemoMinutesPlayed,
  isDemoMatchStarter,
} from './seed-demo-competition'
import { DEMO_MATCH_REVIEWS, DEMO_TEAM_POST_INDEXES } from './seed-demo-social'
import { parseResultsRules } from '../results/parse-rules'
import { parseRosterPolicy } from '../roster/roster-workflow.rules'

test('both seeded tournaments publish complete eight-a-side roster and result policies', () => {
  for (const year of ['2025', '2026'] as const) {
    const document = competitionRules(year)
    const results = parseResultsRules(`demo-rule-${year}`, document)
    assert.deepEqual(results.points, { win: 3, draw: 1, loss: 0 })
    assert.equal(results.knockoutShootout, 'ALLOWED')
    const roster = parseRosterPolicy(document)
    assert.ok(roster)
    assert.equal(roster.playersOnPitch, 8)
    assert.equal(roster.maxPlayers, 14)
    assert.equal(roster.eligiblePlayerIds.length, year === '2026' ? 224 : 112)
  }
})

test('2026 tournament registers all 16 teams with 14 players each', () => {
  assert.equal(DEMO_TOURNAMENT_TEAMS.length, 16)
  assert.equal(new Set(DEMO_TOURNAMENT_TEAMS.map((team) => team.code)).size, 16)
  assert.ok(DEMO_TEAMS.every((team) => team.code.startsWith('DEMO-')))
  assert.equal(new Set(DEMO_PLAYERS.map((player) => player.id)).size, 224)
  assert.equal(new Set(DEMO_PLAYERS.map((player) => player.sourceKey)).size, 224)

  for (const teamIndex of DEMO_TOURNAMENT_TEAMS.keys()) {
    const players = DEMO_PLAYERS.filter((player) => player.teamIndex === teamIndex)
    assert.equal(players.length, 14)
    assert.ok(players.every((player) => player.sourceKey.startsWith('DEMO-2026-DEMO-')))
  }
})

test('four complete group round robins qualify exactly the eight quarterfinal teams', () => {
  const qualified = new Set<number>()
  for (const [groupIndex, group] of DEMO_GROUP_CODES.entries()) {
    const offset = groupIndex * 4
    const matches = DEMO_MATCHES.filter(
      (match) => match.tournament === '2026' && match.group === group,
    )
    assert.equal(matches.length, 6)
    assert.equal(
      new Set(matches.map((match) => [match.homeTeamIndex, match.awayTeamIndex].sort().join(':')))
        .size,
      6,
    )
    assert.ok(
      matches.every((match) =>
        [match.homeTeamIndex, match.awayTeamIndex].every(
          (index) => index !== undefined && index >= offset && index < offset + 4,
        ),
      ),
    )
    const standings = calculateStandings(
      DEMO_TEAMS.slice(offset, offset + 4).map((team, index) => ({
        id: String(offset + index),
        name: team.name,
        shortName: team.shortName,
        primaryColor: team.primaryColor,
      })),
      matches.map((match) => ({
        homeTeamId: String(match.homeTeamIndex),
        awayTeamId: String(match.awayTeamIndex),
        homeScore: match.homeScore!,
        awayScore: match.awayScore!,
        isLive: false,
        startedAt: new Date(match.scheduledStartAt),
      })),
    )
    assert.ok(standings.every((row) => row.played === 3))
    standings.slice(0, 2).forEach((row) => qualified.add(Number(row.id)))
  }
  const quarterfinalTeams = DEMO_MATCHES.filter(
    (match) => match.tournament === '2026' && match.stage === 'KNOCKOUT' && match.round === 2,
  ).flatMap((match) => [match.homeTeamIndex, match.awayTeamIndex])
  assert.equal(qualified.size, 8)
  assert.deepEqual(new Set(quarterfinalTeams), qualified)
  assert.equal(DEMO_MATCHES.filter((match) => match.tournament === '2026').length, 32)
  assert.equal(DEMO_MATCHES.filter((match) => match.tournament === '2025').length, 8)
})

test('2026 knockout facts form an 8-team champion path with an independent third-place branch', () => {
  const knockoutMatches = DEMO_MATCHES.filter(
    (match) => match.tournament === '2026' && match.stage === 'KNOCKOUT',
  )
  const rounds = new Map<number, DemoMatchDefinition[]>()
  for (const match of knockoutMatches) {
    rounds.set(match.round, [...(rounds.get(match.round) ?? []), match])
  }
  for (const matches of rounds.values()) matches.sort(compareMatchCode)

  const roundOf16 = rounds.get(1) ?? []
  const quarterfinals = rounds.get(2) ?? []
  const semifinals = rounds.get(3) ?? []
  const finalRound = rounds.get(4) ?? []
  assert.deepEqual(
    [roundOf16.length, quarterfinals.length, semifinals.length, finalRound.length],
    [0, 4, 2, 2],
  )

  const openingTeamIndexes = quarterfinals.flatMap((match) => [
    match.homeTeamIndex,
    match.awayTeamIndex,
  ])
  assert.equal(
    openingTeamIndexes.every((teamIndex) => teamIndex !== undefined),
    true,
  )
  assert.equal(new Set(openingTeamIndexes).size, 8)
  assert.ok(openingTeamIndexes.every((index) => index !== undefined && index < 16))

  assertProgression(quarterfinals, semifinals)

  const championshipFinal = finalRound.find((match) => match.code === 'GC26-FINAL')
  const thirdPlace = finalRound.find((match) => match.code === 'GC26-THIRD')
  assert.ok(championshipFinal)
  assert.ok(thirdPlace)
  assert.equal(championshipFinal.homeTeamIndex, winnerIndex(semifinals[0]!))
  assert.equal(championshipFinal.awayTeamIndex, undefined)
  assert.equal(thirdPlace.homeTeamIndex, loserIndex(semifinals[0]!))
  assert.equal(thirdPlace.awayTeamIndex, undefined)
  assert.notEqual(thirdPlace.code, championshipFinal.code)
})

test('every team with seeded appearances has exactly 8 starters per match', () => {
  assert.equal(DEMO_STARTERS_PER_TEAM, 8)
  assert.deepEqual(
    Array.from({ length: 14 }, (_, playerIndex) => getDemoMinutesPlayed(playerIndex, 90)),
    [90, 0, 90, 90, 90, 0, 90, 60, 60, 30, 90, 30, 0, 0],
  )

  const matchesWithAppearances = DEMO_MATCHES.filter(
    (match) =>
      match.homeTeamIndex !== undefined &&
      match.awayTeamIndex !== undefined &&
      match.homeScore !== undefined &&
      match.awayScore !== undefined &&
      (match.status === 'FINISHED' || match.status === 'LIVE'),
  )
  assert.ok(matchesWithAppearances.length > 0)

  for (const match of matchesWithAppearances) {
    for (const teamIndex of [match.homeTeamIndex!, match.awayTeamIndex!]) {
      const teamPlayers = DEMO_PLAYERS.filter((player) => player.teamIndex === teamIndex)
      const matchMinutes = match.status === 'LIVE' ? 64 : 90
      const seededMinutes = teamPlayers.map((_, playerIndex) =>
        getDemoMinutesPlayed(playerIndex, matchMinutes),
      )
      assert.equal(
        teamPlayers.filter((_, playerIndex) => isDemoMatchStarter(playerIndex)).length,
        8,
        `${match.code} team ${teamIndex} should seed exactly 8 starters`,
      )
      const starters = teamPlayers.filter((_, playerIndex) => isDemoMatchStarter(playerIndex))
      assert.deepEqual(
        {
          GOALKEEPER: starters.filter((player) => player.position === 'GOALKEEPER').length,
          DEFENDER: starters.filter((player) => player.position === 'DEFENDER').length,
          MIDFIELDER: starters.filter((player) => player.position === 'MIDFIELDER').length,
          FORWARD: starters.filter((player) => player.position === 'FORWARD').length,
        },
        { GOALKEEPER: 1, DEFENDER: 3, MIDFIELDER: 3, FORWARD: 1 },
        `${match.code} team ${teamIndex} should seed an eight-a-side 3-3-1`,
      )
      assert.equal(
        seededMinutes.reduce((total, minutes) => total + minutes, 0),
        matchMinutes * 8,
        `${match.code} team ${teamIndex} should preserve eight-a-side player minutes`,
      )
      assert.ok(
        seededMinutes.every(
          (minutes, playerIndex) => isDemoMatchStarter(playerIndex) || minutes < matchMinutes,
        ),
        `${match.code} team ${teamIndex} substitutes must not play the full match`,
      )
    }
  }
})

test('SF-01 community facts are published after the rescheduled semifinal', () => {
  const semifinal = DEMO_MATCHES.find((match) => match.code === 'GC26-SF-01')
  assert.ok(semifinal?.scheduledStartAt)
  const fullTime = Date.parse(semifinal.scheduledStartAt) + 90 * 60 * 1000

  const reporterPost = DEMO_POSTS.find((post) => post.key === 'community-reporter')
  assert.ok(reporterPost)
  assert.ok(Date.parse(reporterPost.publishedAt) > fullTime)

  const reviews = DEMO_MATCH_REVIEWS.filter((review) => review.matchCode === semifinal.code)
  assert.equal(reviews.length, 3)
  assert.ok(reviews.every((review) => Date.parse(review.createdAt) > fullTime))
})

test('official posts split tournament organizer notices from platform notices', () => {
  const official = DEMO_POSTS.filter((post) => post.type === 'OFFICIAL')
  const tournament = official.filter((post) => !isPlatformDemoPost(post))
  const platform = official.filter((post) => isPlatformDemoPost(post))

  assert.deepEqual(
    tournament.map((post) => post.title),
    ['绿茵杯进行中', '半决赛还差一场', '决赛档期已排定'],
  )
  assert.ok(tournament.every((post) => post.imageUrl && post.audience === 'TOURNAMENT'))
  assert.ok(tournament.every((post) => /绿茵杯|半决赛|决赛/.test(`${post.title}${post.body}`)))
  assert.equal(
    tournament.find((post) => post.title === '绿茵杯进行中')?.body.includes('3 月 1 日'),
    true,
  )
  assert.equal(
    [...tournament].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0]?.title,
    '绿茵杯进行中',
  )

  assert.deepEqual(
    platform.map((post) => post.title),
    ['招募信息管理员', '赛程和数据页已更新', '欢迎提出使用建议', '欢迎来到晓球'],
  )
  assert.ok(platform.every((post) => !post.imageUrl))
  const byDate = [...platform].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  assert.equal(byDate.at(-1)?.title, '欢迎来到晓球', 'the welcome notice sorts last')
  assert.equal(byDate.at(-1)?.body.split('\n').length, 6)
  assert.ok(
    platform.every(
      (post) => !/半决赛|决赛|晋级|绿茵杯进行中/.test(`${post.title ?? ''}${post.body}`),
    ),
  )
  assert.ok(platform.every((post) => DEMO_TEAM_POST_INDEXES[post.key] === undefined))
})

function assertProgression(
  sourceMatches: DemoMatchDefinition[],
  targetMatches: DemoMatchDefinition[],
) {
  assert.equal(sourceMatches.length, targetMatches.length * 2)
  for (const [targetIndex, target] of targetMatches.entries()) {
    assert.equal(target.homeTeamIndex, winnerIndex(sourceMatches[targetIndex * 2]!))
    assert.equal(target.awayTeamIndex, winnerIndex(sourceMatches[targetIndex * 2 + 1]!))
  }
}

function winnerIndex(match: DemoMatchDefinition): number {
  assert.notEqual(match.homeTeamIndex, undefined)
  assert.notEqual(match.awayTeamIndex, undefined)
  assert.notEqual(match.homeScore, undefined)
  assert.notEqual(match.awayScore, undefined)
  if (match.homeScore! > match.awayScore!) return match.homeTeamIndex!
  if (match.homeScore! < match.awayScore!) return match.awayTeamIndex!
  assert.notEqual(match.homePenaltyScore, undefined)
  assert.notEqual(match.awayPenaltyScore, undefined)
  return match.homePenaltyScore! > match.awayPenaltyScore!
    ? match.homeTeamIndex!
    : match.awayTeamIndex!
}

function loserIndex(match: DemoMatchDefinition): number {
  const winner = winnerIndex(match)
  return match.homeTeamIndex === winner ? match.awayTeamIndex! : match.homeTeamIndex!
}

function compareMatchCode(left: DemoMatchDefinition, right: DemoMatchDefinition): number {
  return left.code.localeCompare(right.code, 'en', { numeric: true })
}
