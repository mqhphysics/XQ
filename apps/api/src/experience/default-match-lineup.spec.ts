import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultMatchLineup } from './default-match-lineup'

const entries = Array.from({ length: 10 }, (_, i) => ({
  playerProfileId: `p${i}`,
  displayName: `冻结姓名${i}`,
  shirtNumber: String(i + 1),
  playerProfile: { position: null, avatarUrl: null },
}))
const lineup = {
  format: 8,
  formation: '3-3-1',
  slots: Array.from({ length: 8 }, (_, i) => ({
    playerId: `p${i}`,
    x: 50,
    y: i === 0 ? 90 : 40,
    label: i === 0 ? 'GK' : i <= 3 ? 'DF' : i <= 6 ? 'MF' : 'FW',
  })),
}
test('team defaults use published slots and current tournament roster without inventing appearances', () => {
  const result = defaultMatchLineup(entries, { name: 'PRIVATE_TACTIC_NAME', lineup })
  assert.equal(result.lineupSource, 'TEAM_DEFAULT')
  assert.equal(result.players.filter((p) => p.starter).length, 8)
  assert.equal(result.players.length, 10)
  assert.deepEqual(result.players[0]!.pitchPosition, { x: 50, y: 10 })
  assert.equal(result.players[0]!.position, 'GOALKEEPER')
  assert(result.players.every((p) => p.minutesPlayed === null))
  assert.equal(result.appearanceRecorded, false)
  assert.equal(JSON.stringify(result).includes('PRIVATE_'), false)
})
test('partial defaults fill eight places from the roster; invalid selections never become starters', () => {
  const partial = defaultMatchLineup(entries, {
    lineup: {
      ...lineup,
      slots: lineup.slots.map((s, i) => ({ ...s, playerId: i > 5 ? null : s.playerId })),
    },
  })
  assert.equal(partial.players.filter((p) => p.starter).length, 8)
  assert.equal(partial.players.filter(p => p.starter && p.position === 'GOALKEEPER').length, 1)
  assert.equal(partial.players.filter(p => p.starter && p.position === 'FORWARD').length, 1)
  for (const payload of [
    undefined,
    { lineup: { ...lineup, slots: lineup.slots.map((s) => ({ ...s, playerId: 'foreign' })) } },
    { lineup: { ...lineup, slots: lineup.slots.slice(1) } },
  ]) {
    const result = defaultMatchLineup(entries, payload)
    assert.equal(result.lineupSource, 'TEAM_ROSTER')
    assert(result.players.every((p) => !p.starter && p.minutesPlayed === null))
  }
  assert.equal(defaultMatchLineup([]).lineupSource, 'UNAVAILABLE')
})
