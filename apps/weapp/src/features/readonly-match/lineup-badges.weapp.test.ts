import test from 'node:test'
import assert from 'node:assert/strict'
import { lineupBadges } from './lineup-badges.weapp.ts'
test('every goal stays in the lower-right row while cards precede timed substitutions in the upper row', () => {
  const rows = lineupBadges({
    goals: ['3′', '10′', '20′'],
    assists: ['12′'],
    ownGoals: [],
    yellowCards: ['25′'],
    redCards: [],
    on: ['5′'],
    off: ['30′'],
  })
  assert.deepEqual(
    rows.scores.map((row) => row.kind),
    ['goals', 'goals', 'goals', 'assists'],
  )
  assert.deepEqual(
    rows.discipline.map((row) => row.kind),
    ['yellowCards', 'on', 'off'],
  )
  assert.deepEqual(
    rows.discipline
      .filter((row) => row.kind === 'on' || row.kind === 'off')
      .map((row) => row.minute),
    ['5′', '30′'],
  )
})
