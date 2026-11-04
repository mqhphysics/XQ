import assert from 'node:assert/strict'
import test from 'node:test'
import { sameFocusOrigin, type FocusIdentity } from './focus-origin.logic.ts'

const trigger: FocusIdentity = {
  tagName: 'BUTTON',
  id: '',
  label: '查看物院一队对阵物院二队的比赛详情',
  href: null,
  className: 'schedule-row__detail',
  text: '查看详情',
}

test('a remounted trigger restores focus by its specific accessible label', () => {
  assert.equal(sameFocusOrigin(trigger, { ...trigger }), true)
  assert.equal(sameFocusOrigin(trigger, { ...trigger, label: '查看另一场比赛详情' }), false)
  assert.equal(sameFocusOrigin(trigger, { ...trigger, tagName: 'A' }), false)
})

test('a remounted match link uses the full destination when no accessible label exists', () => {
  const link = { ...trigger, tagName: 'A', label: null, href: '/match?matchId=one' }
  assert.equal(sameFocusOrigin(link, { ...link }), true)
  assert.equal(sameFocusOrigin(link, { ...link, href: '/match?matchId=two' }), false)
})

test('unlabelled triggers require the same text and class; empty page focus is not a trigger', () => {
  const unlabelled = { ...trigger, label: null }
  assert.equal(sameFocusOrigin(unlabelled, { ...unlabelled }), true)
  assert.equal(sameFocusOrigin(unlabelled, { ...unlabelled, className: 'another-action' }), false)
  assert.equal(sameFocusOrigin({ ...unlabelled, text: '' }, { ...unlabelled, text: '' }), false)
})
