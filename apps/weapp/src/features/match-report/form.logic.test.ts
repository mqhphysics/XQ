import assert from 'node:assert/strict'
import test from 'node:test'
import { resizeGoals } from './form.logic.ts'
import type { ReportFields } from './repository.weapp'

test('score edits retain existing goal identities, own goals and unrelated events', () => {
  const fields: ReportFields = {
    homeScore: '2',
    awayScore: '1',
    homePenaltyScore: '',
    awayPenaltyScore: '',
    outcome: 'FINISHED',
    notes: '',
    events: [
      {
        clientEventId: 'home',
        kind: 'GOAL',
        side: 'HOME',
        playerId: 'p1',
        minute: '12',
        addedMinute: '',
        relatedPlayerId: '',
      },
      {
        clientEventId: 'own',
        kind: 'OWN_GOAL',
        side: 'AWAY',
        playerId: 'p2',
        minute: '20',
        addedMinute: '',
        relatedPlayerId: '',
      },
      {
        clientEventId: 'away',
        kind: 'GOAL',
        side: 'AWAY',
        playerId: 'p2',
        minute: '30',
        addedMinute: '',
        relatedPlayerId: '',
      },
      {
        clientEventId: 'card',
        kind: 'YELLOW_CARD',
        side: 'HOME',
        playerId: 'p1',
        minute: '40',
        addedMinute: '',
        relatedPlayerId: '',
      },
    ],
  }
  const enlarged = resizeGoals(fields, 'HOME', '3', () => 'new')
  assert.deepEqual(enlarged.events.slice(0, 4), fields.events)
  assert.equal(enlarged.events[4]?.clientEventId, 'new')
  assert.equal(enlarged.events[4]?.minute, '')
  assert.deepEqual(
    resizeGoals(enlarged, 'HOME', '1', () => '').events.map((e) => e.clientEventId),
    ['home', 'away', 'card'],
  )
  assert.deepEqual(
    resizeGoals(fields, 'AWAY', '0', () => '').events.map((e) => e.clientEventId),
    ['home', 'own', 'card'],
  )
  assert.equal(fields.events.length, 4)
})
