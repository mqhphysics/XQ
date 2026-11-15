import assert from 'node:assert/strict'
import test from 'node:test'
import { rankScorers } from './scorer-board'

test('scorers share ranks and all tied players at the cutoff are returned', () => {
  const goals = [5, 4, 3, 2, 2, ...Array<number>(9).fill(1), 0]
  const rows = rankScorers(goals.map((goals, index) => ({ goals, assists: index })))
  assert.deepEqual(
    rows.map(({ rank }) => rank),
    [1, 2, 3, 4, 4, ...Array<number>(9).fill(6)],
  )
  assert.deepEqual(
    rows.filter(({ goals }) => goals === 2).map(({ assists }) => assists),
    [3, 4],
  )
})
