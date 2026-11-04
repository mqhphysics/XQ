import assert from 'node:assert/strict'
import test from 'node:test'
import { createLineupDisplay, depthsForLanes, designateGoalkeeper } from './lineup-display.h5.ts'
import { lineupGroups, lineupSections, type MatchLineup, type PlayerMatchEvents } from './lineup.logic.ts'

const player = (
  id: string,
  position: string | null,
  extra: Partial<MatchLineup['players'][number]> = {},
): MatchLineup['players'][number] => ({
  id,
  displayName: id,
  shirtNumber: id,
  position,
  starter: true,
  minutesPlayed: 90,
  pitchPosition: null,
  ...extra,
})

test('default display places goalkeeper at the goal and separates defence, midfield and attack without editing facts', () => {
  const players = [
    player('1', 'GOALKEEPER'),
    player('2', 'DEFENDER'),
    player('3', 'DEFENDER'),
    player('4', 'MIDFIELDER'),
    player('5', 'FORWARD'),
  ]
  const before = JSON.stringify(players)
  const display = createLineupDisplay(players)
  assert.equal(display.source, 'DEFAULT')
  const depths = new Map(display.players.map(({ player, point }) => [player.id, point.y]))
  assert.ok(
    depths.get('1')! < depths.get('2')! &&
      depths.get('2')! < depths.get('4')! &&
      depths.get('4')! < depths.get('5')!,
  )
  const defenders = display.players.filter(({ player }) => player.position === 'DEFENDER')
  assert.ok(defenders[0]!.point.x < 50 && defenders[1]!.point.x > 50)
  assert.equal(JSON.stringify(players), before)
})

test('published coordinates take priority over position defaults', () => {
  const players = [
    { ...player('1', 'GOALKEEPER'), pitchPosition: { x: 42, y: 12 } },
    { ...player('2', 'FORWARD'), pitchPosition: { x: 73, y: 66 } },
  ]
  const display = createLineupDisplay(players)
  assert.equal(display.source, 'PUBLISHED')
  assert.deepEqual(
    display.players.map(({ point }) => point),
    players.map(({ pitchPosition }) => pitchPosition),
  )
})

test('default layout keeps a single goalkeeper lane and does not promote bench players', () => {
  const players = [
    player('1', 'GOALKEEPER'),
    player('12', 'GOALKEEPER'),
    { ...player('9', 'FORWARD'), starter: false },
  ]
  const lineup = { players } as MatchLineup
  const display = createLineupDisplay(lineupGroups(lineup).starters)
  assert.deepEqual(
    display.players.map(({ player }) => player.id),
    ['1', '12'],
  )
  assert.equal(designateGoalkeeper(display.players.map(({ player }) => player)), '1')
  const keeper = display.players.find(({ player }) => player.id === '1')!
  const extra = display.players.find(({ player }) => player.id === '12')!
  assert.equal(keeper.lane, 'GOALKEEPER')
  assert.equal(extra.lane, 'DEFENDER')
  assert.ok(keeper.point.y < extra.point.y)
  assert.equal(display.players.filter(({ lane }) => lane === 'GOALKEEPER').length, 1)
})

test('eight-a-side 3-3-1 rows occupy the half evenly with a forward at the halfway line', () => {
  const display = createLineupDisplay([
    player('1', 'GOALKEEPER'),
    player('2', 'DEFENDER'),
    player('3', 'DEFENDER'),
    player('4', 'DEFENDER'),
    player('6', 'MIDFIELDER'),
    player('8', 'MIDFIELDER'),
    player('10', 'MIDFIELDER'),
    player('7', 'FORWARD'),
  ])
  const byLane = new Map(display.players.map(({ lane, point }) => [lane, point.y]))
  assert.equal(display.players.filter(({ lane }) => lane === 'GOALKEEPER').length, 1)
  assert.equal(display.players.filter(({ lane }) => lane === 'FORWARD').length, 1)
  assert.equal(byLane.get('GOALKEEPER'), 12)
  assert.equal(byLane.get('FORWARD'), 88)
  assert.ok(byLane.get('DEFENDER')! > byLane.get('GOALKEEPER')!)
  assert.ok(byLane.get('MIDFIELDER')! > byLane.get('DEFENDER')!)
  const spread = depthsForLanes(['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD'])
  assert.deepEqual(
    [...spread.values()].map((value) => Number(value.toFixed(2))),
    [12, 37.33, 62.67, 88],
  )
})

test('missing or invalid coordinates use a bounded default; empty starters remain empty', () => {
  const display = createLineupDisplay([{ ...player('1', null), pitchPosition: { x: -1, y: 200 } }])
  assert.equal(display.source, 'DEFAULT')
  for (const { point } of display.players)
    assert.ok(point.x > 0 && point.x < 100 && point.y > 0 && point.y < 100)
  assert.deepEqual(createLineupDisplay([]).players, [])
})

test('unused substitutes stay on the bench without invented injuries or suspensions', () => {
  const lineup = {
    players: [
      player('1', 'GOALKEEPER'),
      { ...player('12', 'GOALKEEPER'), starter: false, minutesPlayed: 0, shirtNumber: '12' },
      { ...player('8', 'MIDFIELDER'), starter: false, minutesPlayed: 30, shirtNumber: '10' },
      { ...player('18', 'FORWARD'), starter: false, minutesPlayed: 0, shirtNumber: '18' },
    ],
  } as MatchLineup
  const sections = lineupSections(lineup)
  assert.deepEqual(
    sections.unavailable.map((item) => item.shirtNumber),
    [],
  )
  assert.deepEqual(
    sections.bench.map((item) => item.shirtNumber),
    ['12', '10', '18'],
  )
})

test('unknown eight-player positions spread into goalkeeper, defence, midfield and attack without changing identities', () => {
  const players = Array.from({ length: 8 }, (_, i) => player(String(i + 1), null))
  const before = JSON.stringify(players),
    display = createLineupDisplay(players, true)
  assert.equal(new Set(display.players.map((p) => p.lane)).size, 4)
  assert.equal(display.players.filter((p) => p.lane === 'GOALKEEPER').length, 1)
  assert.equal(display.players.length, 8)
  assert.equal(display.players.find((p) => p.player.shirtNumber === '7')?.lane, 'FORWARD')
  assert.equal(JSON.stringify(players), before)
})

test('automatic positions use scoring and substitution evidence and leave captain out of goal', () => {
  const players = Array.from({ length: 8 }, (_, i) => player(String(i + 1), null))
  players[0]!.isCaptain = true
  const empty = {
    goals: [],
    assists: [],
    ownGoals: [],
    yellowCards: [],
    redCards: [],
    on: [],
    off: [],
  }
  const hints = new Map<string, PlayerMatchEvents>([
    ...['2', '3', '4', '5'].map((id): [string, PlayerMatchEvents] => [id, { ...empty, goals: ['12′'] }]),
    ['6', { ...empty, off: ['20′'] }],
  ])
  const display = createLineupDisplay(players, true, hints)
  assert(!['1', '2', '3', '4', '5', '6'].includes(display.keeperId!))
  assert.equal(display.players.filter((entry) => entry.lane === 'FORWARD').length, 3)
  assert.equal(display.players.find((entry) => entry.player.id === '5')!.lane, 'MIDFIELDER')
})
