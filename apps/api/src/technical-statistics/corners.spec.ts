import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyTechnicalTotals,
  technicalState,
  technicalTotals,
  technicalV3Required,
  type TechnicalOperation,
  type TechnicalTotals,
} from '@xiaoqiu/contracts'

test('corners count for their team, undo safely, and require a v3 reader even after undo', () => {
  const corner: TechnicalOperation = {
    id: 'corner',
    occurredAt: '2026-11-07T00:00:00Z',
    kind: 'COUNT',
    metric: 'CORNER',
    outcome: 'SUCCESS',
    teamId: 'home',
    playerId: null,
  }
  assert.equal(technicalTotals([corner], 'home').corners, 1)
  assert.equal(technicalTotals([corner], 'away').corners, 0)
  const undone: TechnicalOperation[] = [
    corner,
    { id: 'undo', occurredAt: corner.occurredAt, kind: 'UNDO', targetId: 'corner' },
  ]
  assert.equal(technicalTotals(undone, 'home').corners, 0)
  assert.equal(technicalV3Required(undone), true)
  assert.throws(() => technicalState([{ ...corner, playerId: 'player' }]), /球队/)
})
test('old v2 totals without the new key still fold as zero corners', () => {
  const totals = emptyTechnicalTotals()
  delete (totals as Partial<TechnicalTotals>).corners
  const operations: TechnicalOperation[] = [
    {
      id: 'legacy',
      occurredAt: '2026-11-07T00:00:00Z',
      kind: 'SET_TOTALS',
      teamId: 'home',
      playerId: null,
      totals,
    },
  ]
  assert.equal(technicalTotals(operations, 'home').corners, 0)
  assert.equal(technicalV3Required(operations), false)
})
