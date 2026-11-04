import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectPlayerEvents,
  eventSide,
  hasPublishedPositions,
  lineupGroups,
  lineupHasAppearances,
  mergeAppearanceEvents,
  minuteLabel,
  playerEventDetails,
  playerAppearanceLabel,
  type MatchEvent,
  type MatchLineup,
} from './lineup.logic.ts'

const team = {
  id: 'home',
  teamCode: 'H',
  collegeName: null,
  name: '主队',
  shortName: '主队',
  primaryColor: null,
  secondaryColor: null,
  crestUrl: null,
}
function event(
  id: string,
  type: string,
  minute: number,
  playerId: string,
  relatedId?: string,
): MatchEvent {
  return {
    id,
    type,
    minute,
    stoppageMinute: null,
    description: null,
    team,
    player: { id: playerId, displayName: playerId },
    relatedPlayer: relatedId ? { id: relatedId, displayName: relatedId } : null,
  }
}

test('substitute can enter, score, assist and later leave; both paired transitions remain visible', () => {
  const events = collectPlayerEvents(
    [
      event('off', 'SUBSTITUTION', 81, 'sub', 'second'),
      event('goal', 'GOAL', 65, 'sub', 'starter'),
      event('assist', 'GOAL', 72, 'starter', 'sub'),
      { ...event('on', 'SUBSTITUTION', 45, 'starter', 'sub'), stoppageMinute: 2 },
    ],
    'home',
  )
  assert.deepEqual(events.get('sub'), {
    goals: ['65′'],
    assists: ['72′'],
    ownGoals: [],
    yellowCards: [],
    redCards: [],
    on: ['45+2′'],
    off: ['81′'],
  })
  assert.deepEqual(playerEventDetails(events.get('sub')), [
    '进球 65′',
    '助攻 72′',
    '换上 45+2′',
    '换下 81′',
  ])
  assert.deepEqual(events.get('second')?.on, ['81′'])
})

test('unconfirmed data never supplies starters and confirmed plans do not invent appearances', () => {
  const player = {
    id: 'confirmed-player',
    displayName: 'DEMO_FIXTURE 队员',
    shirtNumber: '8',
    position: null,
    starter: true,
    minutesPlayed: null,
  }
  const unconfirmed: MatchLineup = { team, lineupSource: 'UNAVAILABLE', players: [player] }
  assert.deepEqual(lineupGroups(unconfirmed), { starters: [], substitutes: [] })
  const confirmed: MatchLineup = {
    ...unconfirmed,
    lineupSource: 'CONFIRMED_MATCH_LINEUP',
    appearanceRecorded: false,
  }
  assert.equal(lineupGroups(confirmed).starters.length, 1)
  assert.equal(lineupHasAppearances(confirmed), false)
  assert.equal(playerAppearanceLabel(player, false), '实际出场未录入')
  assert.equal(playerAppearanceLabel({ ...player, minutesPlayed: 0 }, false), '实际出场未录入')
  assert.equal(playerAppearanceLabel({ ...player, minutesPlayed: 60 }, true), '60 分钟')
  assert.equal(playerAppearanceLabel(player, true), '出场分钟未提供')
  assert.equal(
    playerAppearanceLabel({ ...player, starter: false, minutesPlayed: 0 }, true),
    '未出场',
  )
})

test('own goals, penalties and opposite-team events cannot create false assists or goals', () => {
  const events = collectPlayerEvents(
    [
      event('own', 'OWN_GOAL', 8, 'p', 'other'),
      event('penalty', 'PENALTY_SCORED', 20, 'p', 'other'),
      event('miss', 'PENALTY_MISSED', 30, 'p'),
      { ...event('away', 'GOAL', 40, 'p', 'other'), team: { ...team, id: 'away' } },
    ],
    'home',
  )
  assert.deepEqual(events.get('p')?.goals, ['20′'])
  assert.deepEqual(events.get('p')?.ownGoals, ['8′'])
  assert.equal(events.has('other'), false)
})

test('corrected or removed events are reflected when recomputing, without retained local counters', () => {
  const first = event('goal', 'GOAL', 10, 'a', 'b')
  assert.equal(collectPlayerEvents([first], 'home').get('a')?.goals.length, 1)
  const corrected = { ...first, player: { id: 'c', displayName: 'c' }, relatedPlayer: null }
  const current = collectPlayerEvents([corrected], 'home')
  assert.equal(current.has('a'), false)
  assert.deepEqual(current.get('c')?.goals, ['10′'])
  assert.equal(collectPlayerEvents([], 'home').size, 0)
})

test('no formation or roster ordering can promote a substitute to a starter', () => {
  const lineup: MatchLineup = {
    team,
    players: Array.from({ length: 14 }, (_, index) => ({
      id: String(index),
      displayName: String(index),
      shirtNumber: null,
      position: null,
      starter: index === 13,
      minutesPlayed: 0,
    })),
  }
  assert.deepEqual(
    lineupGroups(lineup).starters.map((player) => player.id),
    ['13'],
  )
  assert.equal(lineupGroups(lineup).substitutes.length, 13)
  assert.equal(hasPublishedPositions(lineupGroups(lineup).starters), false)
  assert.equal(hasPublishedPositions([]), false)
  assert.equal(
    hasPublishedPositions([{ ...lineup.players[13]!, pitchPosition: { x: 50, y: 88 } }]),
    true,
  )
  assert.equal(
    hasPublishedPositions([{ ...lineup.players[13]!, pitchPosition: { x: -1, y: 88 } }]),
    false,
  )
  assert.equal(minuteLabel({ minute: 90, stoppageMinute: 5 }), '90+5′')
})

test('home events stay on the left and away events on the right', () => {
  const home = event('g', 'GOAL', 10, 'a')
  const away = { ...event('g2', 'GOAL', 12, 'b'), team: { ...team, id: 'away' } }
  assert.equal(eventSide(home, 'home'), 'home')
  assert.equal(eventSide(away, 'home'), 'away')
})

test('missing substitution events are recovered from recorded minutes without inventing scores', () => {
  const lineup: MatchLineup = {
    team,
    players: [
      {
        id: 'starter',
        displayName: 'starter',
        shirtNumber: '8',
        position: 'MIDFIELDER',
        starter: true,
        minutesPlayed: 60,
      },
      {
        id: 'sub',
        displayName: 'sub',
        shirtNumber: '14',
        position: 'FORWARD',
        starter: false,
        minutesPlayed: 30,
      },
    ],
  }
  const merged = mergeAppearanceEvents(new Map(), lineup)
  assert.deepEqual(merged.get('starter')?.off, ['60′'])
  assert.deepEqual(merged.get('sub')?.on, ['60′'])
  assert.deepEqual(merged.get('starter')?.goals, [])
  const sixty = mergeAppearanceEvents(new Map(), lineup, 60)
  assert.deepEqual(sixty.get('starter')?.off, [])
  assert.deepEqual(sixty.get('sub')?.on, ['30′'])
})
