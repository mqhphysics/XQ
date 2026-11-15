import assert from 'node:assert/strict'
import test from 'node:test'
import { fixtureRoundName } from './fixture-round'

test('two fixtures in a shared finals round get their own public labels', () => {
  const shared = { stage: { type: 'KNOCKOUT' }, round: { name: '决赛及三四名赛' } }
  assert.equal(
    fixtureRoundName({ ...shared, matchCode: 'W-015', title: '决赛：13胜 vs 14胜' }),
    '决赛',
  )
  assert.equal(
    fixtureRoundName({ ...shared, matchCode: 'W-016', title: '三四名赛：13负 vs 14负' }),
    '三四名赛',
  )
  assert.equal(fixtureRoundName({ ...shared, matchCode: 'W-FINAL', title: '物院对城公' }), '决赛')
  assert.equal(
    fixtureRoundName({
      ...shared,
      matchCode: 'M-SF-01',
      title: '半决赛',
      round: { name: '半决赛' },
    }),
    '半决赛',
  )
})
