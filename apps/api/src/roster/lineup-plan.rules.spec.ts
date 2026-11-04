import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { validateLineupPlan } from './lineup-plan.rules'
import type { SaveLineupPlanDto } from './lineup-plan.dto'

function fixture(kind: 'TACTIC' | 'MATCH_LINEUP' = 'TACTIC'): SaveLineupPlanDto {
  return {
    name: 'DEMO_FIXTURE 边路推进',
    kind,
    expectedVersion: 0,
    ...(kind === 'MATCH_LINEUP'
      ? { tournamentId: randomUUID(), matchId: randomUUID(), rosterSnapshotId: randomUUID() }
      : {}),
    payload: {
      formation: '3-3-1',
      format: 8,
      slots: Array.from({ length: 8 }, (_, index) => ({
        slotId: `slot-${index}`,
        label: index === 0 ? 'GK' : `POS-${index}`,
        x: 50,
        y: 10 + index * 10,
        playerId: kind === 'MATCH_LINEUP' ? randomUUID() : null,
      })),
      benchPlayerIds: [],
    },
  }
}
test('8-player tactical template may have empty positions; a match lineup requires complete unique starters and one goalkeeper', () => {
  assert.deepEqual(validateLineupPlan(fixture()), [])
  assert.equal(validateLineupPlan(fixture('MATCH_LINEUP')).length, 8)
  const missing = fixture('MATCH_LINEUP')
  missing.payload.slots[1]!.playerId = null
  assert.throws(() => validateLineupPlan(missing), /补齐/)
  const keeper = fixture('MATCH_LINEUP')
  keeper.payload.slots[0]!.label = 'CB'
  assert.throws(() => validateLineupPlan(keeper), /门将/)
})
test('duplicate positions, duplicate starters/bench and mismatched context are rejected', () => {
  const input = fixture('MATCH_LINEUP')
  input.payload.benchPlayerIds = [input.payload.slots[0]!.playerId!]
  assert.throws(() => validateLineupPlan(input), /同一球员/)
  const duplicate = fixture()
  duplicate.payload.slots[1]!.slotId = duplicate.payload.slots[0]!.slotId
  assert.throws(() => validateLineupPlan(duplicate), /编号/)
  const wrongFormat = fixture()
  Object.assign(wrongFormat.payload, { format: 7 })
  assert.throws(() => validateLineupPlan(wrongFormat), /八人制/)
  const wrongKind = fixture()
  wrongKind.matchId = randomUUID()
  assert.throws(() => validateLineupPlan(wrongKind), /普通战术/)
})

test('non-eight formats are rejected even when their slot counts match', () => {
  for (const format of [5, 7, 11]) {
    const input = fixture()
    Object.assign(input.payload, {
      format,
      slots: Array.from({ length: format }, (_, index) => ({
        ...input.payload.slots[index % 8]!,
        slotId: `slot-${index}`,
      })),
    })
    assert.throws(() => validateLineupPlan(input), /八人制/)
  }
})
