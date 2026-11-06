import assert from 'node:assert/strict'
import test from 'node:test'
import { playerSchedule } from './player-schedule'

test('player history retains all evidence-backed matches and upcoming team fixtures without inventing appearances', () => {
  const fixture = (id: string, status = 'FINISHED', homeTeamId = 'own') => ({
    id,
    status,
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
  const result = playerSchedule(fixtures, ['own'], 'player', appearances, [
    { matchId: 'eight-zero', type: 'GOAL', playerId: 'player', relatedPlayerId: null },
  ])
  assert.equal(result.length, 10)
  assert.ok(result.some((row) => row.match.id === 'eight-zero'))
  assert.equal(result.find((row) => row.match.id === 'eight-zero')?.minutesPlayed, null)
  assert.equal(result.find((row) => row.match.id === 'eight-zero')?.participationConfirmed, true)
  assert.equal(result.find((row) => row.match.id === 'future')?.participationConfirmed, false)
  assert.equal(result.find((row) => row.match.id === 'future')?.starter, null)
  assert.ok(
    !result.some((row) => ['not-played', 'foreign', 'draft', 'cancelled'].includes(row.match.id)),
  )
})

test('substituted players, assists and confirmed starters are retained; unused substitutes and bench cards do not create appearances', () => {
  const fixtures = ['sub', 'assist', 'starter', 'card'].map((id) => ({
    id,
    status: 'FINISHED',
    homeTeamId: 'own',
    awayTeamId: 'other',
  }))
  const result = playerSchedule(
    fixtures,
    ['own'],
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
    ['sub', 'assist', 'starter'],
  )
  assert.equal(result.find((row) => row.match.id === 'starter')?.starter, true)
})
