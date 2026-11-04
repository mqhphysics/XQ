import test from 'node:test'
import assert from 'node:assert/strict'
import { publicSearchPlan, publicSearchScore, rankPublicSearch } from './search-relevance'
const field = (text: string) => [{ text, weight: 3 }]
test('partial keywords survive another word being wrong and exact matches remain first', () => {
  const values = ['物院二队', '物院一队', '音乐球队']
  assert.equal(rankPublicSearch(values, '物院一队', field, 8)[0], '物院一队')
  assert.equal(rankPublicSearch(values, '物院一对', field, 8)[0], '物院一队')
  assert.ok(rankPublicSearch(values, '物院 完全错词', field, 8).includes('物院一队'))
  assert.ok(publicSearchScore('约球 时间写错', [{ text: '周五来操场约球', weight: 1 }]) > 0)
})
test('one Chinese typo, Latin transposition, whitespace and full-width text remain searchable', () => {
  assert.ok(publicSearchScore('郭试', field('郭斌')) > 0)
  assert.ok(publicSearchScore('physcis', field('physics')) > 0)
  assert.ok(
    publicSearchScore('ＰＨＹＳＩＣＳ', field('physics')) >
      publicSearchScore('physcis', field('physics')),
  )
  assert.ok(publicSearchScore('物院 一队', field('物院一队')) > 0)
})
test('empty punctuation never returns everything and all explicit words participate in candidate recall', () => {
  assert.equal(publicSearchScore('%%%_', field('物院一队')), 0)
  assert.deepEqual(rankPublicSearch(['物院'], '完全不同词', field, 8), [])
  const plan = publicSearchPlan('这个很长的前缀并不是正确关键词 物院 郭斌')
  assert.ok(plan.recall.includes('郭斌'))
  assert.ok(plan.recall.includes('物院'))
  assert.ok(plan.recall.length <= 48)
})
