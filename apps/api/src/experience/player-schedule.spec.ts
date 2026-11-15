import assert from 'node:assert/strict'
import test from 'node:test'
import { playerSchedule, teamFixtureScope } from './player-schedule'

test('player history retains all evidence-backed matches and upcoming team fixtures without inventing appearances', () => {
  const fixture = (id: string, status = 'FINISHED', homeTeamId = 'own') => ({
    id,
    status,
    scheduledStartAt: null,
    homeTeamId,
    awayTeamId: 'opponent',
  })
  const fixtures = [
    ...Array.from({ length: 7 }, (_, i) => fixture(`old-${i}`)),
    fixture('eight-zero'),
    fixture('future', 'SCHEDULED'),
    fixture('undated', 'SCHEDULED'),
    fixture('not-played'),
    fixture('foreign', 'SCHEDULED', 'other'),
    fixture('draft', 'DRAFT'),
    fixture('cancelled', 'CANCELLED'),
  ]
  const appearances = fixtures
    .slice(0, 7)
    .map((match) => ({ matchId: match.id, starter: true, minutesPlayed: 60 }))
  const result = playerSchedule(
    fixtures,
    (match) => match.homeTeamId === 'own',
    'player',
    appearances,
    [{ matchId: 'eight-zero', type: 'GOAL', playerId: 'player', relatedPlayerId: null }],
  )
  assert.equal(result.length, 11)
  assert.ok(result.some((row) => row.match.id === 'eight-zero'))
  assert.equal(result.find((row) => row.match.id === 'eight-zero')?.minutesPlayed, null)
  assert.equal(result.find((row) => row.match.id === 'eight-zero')?.participationConfirmed, true)
  assert.equal(result.find((row) => row.match.id === 'future')?.participationConfirmed, false)
  assert.equal(result.find((row) => row.match.id === 'future')?.starter, null)
  assert.ok(!result.some((row) => ['foreign', 'draft', 'cancelled'].includes(row.match.id)))
  assert.equal(result.find((row) => row.match.id === 'not-played')?.participationConfirmed, false)
})

test('substituted players, assists and confirmed starters are retained; unused substitutes and bench cards do not create appearances', () => {
  const fixtures = ['sub', 'assist', 'starter', 'card'].map((id) => ({
    id,
    status: 'FINISHED',
    scheduledStartAt: null,
    homeTeamId: 'own',
    awayTeamId: 'other',
  }))
  const result = playerSchedule(
    fixtures,
    (match) => match.homeTeamId === 'own',
    'player',
    [],
    [
      { matchId: 'sub', type: 'SUBSTITUTION', playerId: 'out', relatedPlayerId: 'player' },
      { matchId: 'assist', type: 'GOAL', playerId: 'scorer', relatedPlayerId: 'player' },
      { matchId: 'card', type: 'YELLOW_CARD', playerId: 'player', relatedPlayerId: null },
    ],
    new Map([['starter', true]]),
  )
  assert.deepEqual(
    result.map((row) => row.match.id),
    ['sub', 'assist', 'starter', 'card'],
  )
  assert.equal(result.find((row) => row.match.id === 'starter')?.starter, true)
  assert.equal(result.find((row) => row.match.id === 'card')?.participationConfirmed, false)
})

test('team fixtures use dated memberships and the applicable tournament roster version', () => {
  const date = (day: number) => new Date(Date.UTC(2026, 10, day))
  const scope = teamFixtureScope(
    [
      { teamId: 'old', status: 'REMOVED', joinedAt: date(1), removedAt: date(10) },
      { teamId: 'new', status: 'ACTIVE', joinedAt: date(10), removedAt: null },
    ],
    [
      { teamId: 'roster-only', lockedAt: date(12), entries: [{ playerProfileId: 'p' }] },
      { teamId: 'initially-eligible', lockedAt: date(10), entries: [] },
      { teamId: 'roster-only', lockedAt: date(2), entries: [] },
      { teamId: 'initially-eligible', lockedAt: date(2), entries: [{ playerProfileId: 'p' }] },
    ],
  )
  const has = (team: string, day: number) =>
    scope({
      id: 'fixture',
      status: 'FINISHED',
      homeTeamId: team,
      awayTeamId: 'other',
      scheduledStartAt: date(day),
    })
  assert.equal(has('old', 7), true)
  assert.equal(has('old', 10), false)
  assert.equal(has('new', 7), false)
  assert.equal(has('new', 10), true)
  assert.equal(has('roster-only', 5), false)
  assert.equal(has('roster-only', 13), true)
  assert.equal(has('initially-eligible', 1), true)
  assert.equal(has('initially-eligible', 11), false)
})
