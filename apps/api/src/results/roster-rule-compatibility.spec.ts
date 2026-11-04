import assert from 'node:assert/strict'
import test from 'node:test'
import { compatibleRosterExpansion } from './roster-rule-compatibility'

const previous = {
  roster: { minPlayers: 1, maxPlayers: 30, eligiblePlayerIds: ['a', 'b'] },
  results: { points: { win: 3, draw: 1, loss: 0 }, tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'] },
  match: { periodMinutes: 30 },
}
const expanded = { ...previous, roster: { ...previous.roster, eligiblePlayerIds: ['b', 'a', 'c'] } }
test('adding eligible players retains score compatibility without rewriting historical rule IDs', () => {
  assert.equal(compatibleRosterExpansion(previous, expanded), true)
  assert.equal(compatibleRosterExpansion(previous, JSON.parse(JSON.stringify(expanded))), true)
  assert.equal(compatibleRosterExpansion(expanded, previous), false)
})
test('points, tie breakers, match format and roster limits still require their own confirmed rules', () => {
  for (const changed of [
    { ...expanded, results: { ...expanded.results, points: { win: 2, draw: 1, loss: 0 } } },
    {
      ...expanded,
      results: { ...expanded.results, tieBreakers: ['GOALS_FOR', 'GOAL_DIFFERENCE'] },
    },
    { ...expanded, match: { periodMinutes: 20 } },
    { ...expanded, roster: { ...expanded.roster, maxPlayers: 35 } },
    null,
  ])
    assert.equal(compatibleRosterExpansion(previous, changed), false)
})
