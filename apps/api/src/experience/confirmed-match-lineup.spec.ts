import assert from 'node:assert/strict'
import test from 'node:test'
import { confirmedMatchLineup, type ConfirmedLineupPlanSource } from './confirmed-match-lineup'

const context = { organizationId: 'org', tournamentId: 'tournament', teamId: 'team' }
function fixture(): ConfirmedLineupPlanSource {
  return {
    ...context,
    kind: 'MATCH_LINEUP',
    confirmedVersion: 1,
    confirmedAt: new Date('2026-10-04T10:00:00Z'),
    confirmedRevision: {
      organizationId: 'org',
      version: 1,
      payload: {
        name: 'PRIVATE_PLAN_NAME',
        lineup: {
          formation: '3-3-1',
          format: 8,
          slots: Array.from({ length: 8 }, (_, index) => ({
            slotId: `slot-${index}`,
            label: index === 0 ? 'GK' : index <= 3 ? 'DF' : index <= 6 ? 'MF' : 'FW',
            playerId: `player-${index}`,
            x: 50,
            y: index === 0 ? 90 : index <= 3 ? 68 : index <= 6 ? 44 : 20,
          })),
          benchPlayerIds: ['player-8'],
        },
      },
      rosterSnapshot: {
        ...context,
        lockedAt: new Date(),
        entries: Array.from({ length: 10 }, (_, index) => ({
          playerProfileId: `player-${index}`,
          displayName: `冻结姓名${index}`,
          shirtNumber: String(index + 1),
          playerProfile: { position: null },
        })),
      },
    },
  }
}

test('confirmed lineup uses frozen identities and only explicit players without inventing appearances', () => {
  const plan = { ...fixture(), payload: { formation: 'PRIVATE_NEW_DRAFT', format: 11 } }
  const result = confirmedMatchLineup(plan, context)!
  assert.equal(result.lineupSource, 'CONFIRMED_MATCH_LINEUP')
  assert.equal(result.formation, '3-3-1')
  assert.equal(result.players.filter((player) => player.starter).length, 8)
  assert.equal(result.players.length, 9)
  assert.ok(result.players.every((player) => player.minutesPlayed === null))
  assert.equal(result.appearanceRecorded, false)
  assert.equal(result.players[0]!.displayName, '冻结姓名0')
  assert.equal(result.players[0]!.shirtNumber, '1')
  assert.deepEqual(result.players[0]!.pitchPosition, { x: 50, y: 10 })
  assert.equal(result.players[0]!.position, 'GOALKEEPER')
  assert.equal(result.players[7]!.position, 'FORWARD')
  assert.deepEqual(result.players[7]!.pitchPosition, { x: 50, y: 80 })
  assert.equal(result.players[8]!.pitchPosition, null)
  assert.equal(result.confirmedVersion, 1)
  assert.equal(JSON.stringify(result).includes('PRIVATE_'), false)
})

test('default tactics, unconfirmed plans, wrong tenants and missing frozen revisions are unavailable', () => {
  for (const plan of [
    undefined,
    { ...fixture(), kind: 'TACTIC' },
    { ...fixture(), confirmedVersion: null, confirmedAt: null },
    { ...fixture(), confirmedRevision: null },
    { ...fixture(), organizationId: 'other' },
    { ...fixture(), teamId: 'other' },
    { ...fixture(), tournamentId: 'other' },
  ])
    assert.equal(confirmedMatchLineup(plan, context), null)
  const stale = fixture()
  stale.confirmedRevision!.version = 2
  assert.equal(confirmedMatchLineup(stale, context), null)
})

test('malformed, non-eight, duplicate or snapshot-external confirmed payloads cannot become starters', () => {
  const original = fixture().confirmedRevision!.payload as {
    lineup: {
      formation: string
      format: number
      slots: Array<Record<string, unknown>>
      benchPlayerIds: string[]
    }
  }
  for (const lineup of [
    null,
    { ...original.lineup, format: 11 },
    { ...original.lineup, slots: original.lineup.slots.slice(0, 7) },
    {
      ...original.lineup,
      slots: original.lineup.slots.map((slot) => ({ ...slot, playerId: 'player-0' })),
    },
    { ...original.lineup, benchPlayerIds: ['player-0'] },
    { ...original.lineup, benchPlayerIds: ['outside-snapshot'] },
    { ...original.lineup, slots: original.lineup.slots.map((slot) => ({ ...slot, x: Infinity })) },
    { ...original.lineup, slots: original.lineup.slots.map((slot) => ({ ...slot, label: 'GK' })) },
  ]) {
    const plan = fixture()
    plan.confirmedRevision!.payload = { lineup }
    assert.equal(confirmedMatchLineup(plan, context), null)
  }
})
