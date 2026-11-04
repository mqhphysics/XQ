import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReportFieldsDto } from './match-report.dto'
import {
  nextReportStatus,
  reportFieldsEqual,
  requireForfeitScore,
  validateReportFields,
} from './match-report.logic'

const context = {
  homePlayerIds: new Set(['home-1', 'home-2']),
  awayPlayerIds: new Set(['away-1']),
  isKnockout: false,
}
function fields(patch: Partial<ReportFieldsDto> = {}): ReportFieldsDto {
  return {
    homeScore: '1',
    awayScore: '0',
    homePenaltyScore: '',
    awayPenaltyScore: '',
    outcome: 'FINISHED',
    notes: '',
    events: [
      {
        clientEventId: 'local-event-1',
        kind: 'GOAL',
        side: 'HOME',
        minute: '30',
        addedMinute: '',
        playerId: 'home-1',
        relatedPlayerId: '',
      },
    ],
    ...patch,
  }
}

test('保存、提交、退回、确认与修正的状态链', () => {
  assert.equal(nextReportStatus(null, 'SAVE', false), 'DRAFT')
  assert.equal(nextReportStatus('DRAFT', 'SUBMIT', false), 'SUBMITTED')
  assert.equal(nextReportStatus('SUBMITTED', 'RETURN', true), 'RETURNED')
  assert.equal(nextReportStatus('RETURNED', 'SUBMIT', false), 'SUBMITTED')
  assert.equal(nextReportStatus('SUBMITTED', 'CONFIRM', true), 'CONFIRMED')
  assert.equal(nextReportStatus('CONFIRMED', 'CORRECT', true), 'DRAFT')
})
test('信息员不能审核或覆盖已确认赛果，审核不能针对草稿', () => {
  for (const action of ['RETURN', 'CONFIRM', 'CORRECT'] as const)
    assert.throws(() => nextReportStatus('SUBMITTED', action, false))
  assert.throws(() => nextReportStatus('CONFIRMED', 'SAVE', true))
  assert.throws(() => nextReportStatus('SUBMITTED', 'SAVE', true))
  assert.throws(() => nextReportStatus('DRAFT', 'CONFIRM', true))
})
test('不完整进球明细仅可保存，完整提交严格核对比分', () => {
  assert.doesNotThrow(() => validateReportFields(fields({ homeScore: '2' }), context, false))
  assert.throws(() => validateReportFields(fields({ homeScore: '2' }), context, true))
  assert.throws(() => validateReportFields(fields({ homeScore: '0' }), context, false))
})
test('球员必须属于绑定名单中的事件球队，助攻和换人关联也受限制', () => {
  const event = fields().events[0]!
  assert.throws(() =>
    validateReportFields(fields({ events: [{ ...event, playerId: 'away-1' }] }), context, false),
  )
  assert.throws(() =>
    validateReportFields(
      fields({ events: [{ ...event, relatedPlayerId: 'away-1' }] }),
      context,
      false,
    ),
  )
  assert.throws(() =>
    validateReportFields(
      fields({ events: [{ ...event, relatedPlayerId: event.playerId }] }),
      context,
      false,
    ),
  )
  assert.throws(() =>
    validateReportFields(fields({ events: [{ ...event, kind: 'SUBSTITUTION' }] }), context, false),
  )
})
test('乌龙球属于发生事件的球员，但对方得分', () => {
  const event = fields().events[0]!
  assert.doesNotThrow(() =>
    validateReportFields(
      fields({ homeScore: '0', awayScore: '1', events: [{ ...event, kind: 'OWN_GOAL' }] }),
      context,
      true,
    ),
  )
})
test('本地事件标识不能重复；补时不可超上限', () => {
  const event = fields().events[0]!
  assert.throws(() =>
    validateReportFields(fields({ homeScore: '2', events: [event, event] }), context, true),
  )
  assert.throws(() =>
    validateReportFields(fields({ events: [{ ...event, addedMinute: '31' }] }), context, true),
  )
})
test('换不同客户端标识不能重复同一事实，数字前导零和空补时也不能绕过', () => {
  const event = fields().events[0]!
  assert.throws(
    () =>
      validateReportFields(
        fields({
          homeScore: '2',
          events: [event, { ...event, clientEventId: 'another', minute: '030', addedMinute: '00' }],
        }),
        context,
        false,
      ),
    /相同事件重复/,
  )
})
test('换人保留配对，替补先上后下和重新入场合法，不猜报名名单首发', () => {
  const expanded = { ...context, homePlayerIds: new Set(['home-1', 'home-2', 'home-3']) }
  const swap = (id: string, minute: string, playerId: string, relatedPlayerId: string) => ({
    ...fields().events[0]!,
    clientEventId: id,
    kind: 'SUBSTITUTION' as const,
    minute,
    playerId,
    relatedPlayerId,
  })
  const events = [
    swap('first', '50', 'home-1', 'home-2'),
    swap('second', '70', 'home-2', 'home-3'),
    swap('third', '90', 'home-3', 'home-1'),
  ]
  assert.doesNotThrow(() =>
    validateReportFields(fields({ homeScore: '0', events: [...events].reverse() }), expanded, true),
  )
  assert.throws(
    () =>
      validateReportFields(
        fields({
          homeScore: '0',
          events: [events[0]!, swap('wrong-off', '65', 'home-1', 'home-3')],
        }),
        expanded,
        false,
      ),
    /已换下/,
  )
  assert.throws(
    () =>
      validateReportFields(
        fields({
          homeScore: '0',
          events: [events[0]!, swap('wrong-on', '65', 'home-3', 'home-2')],
        }),
        expanded,
        false,
      ),
    /已换上/,
  )
  assert.doesNotThrow(() =>
    validateReportFields(
      fields({ homeScore: '0', events: [events[0]!, { ...events[1]!, minute: '50' }] }),
      expanded,
      true,
    ),
  )
})
test('点球和普通进球分开，淘汰赛平局需有效决胜结果', () => {
  const knockout = { ...context, isKnockout: true }
  const draw = fields({ homeScore: '0', awayScore: '0', events: [] })
  assert.throws(() => validateReportFields(draw, knockout, true))
  assert.doesNotThrow(() =>
    validateReportFields({ ...draw, homePenaltyScore: '5', awayPenaltyScore: '4' }, knockout, true),
  )
  assert.throws(() =>
    validateReportFields({ ...draw, homePenaltyScore: '5', awayPenaltyScore: '' }, knockout, true),
  )
  assert.throws(() =>
    validateReportFields({ ...draw, homePenaltyScore: '5', awayPenaltyScore: '5' }, knockout, true),
  )
  assert.throws(() =>
    validateReportFields({ ...draw, homePenaltyScore: '5', awayPenaltyScore: '4' }, context, true),
  )
})
test('事件数组顺序不影响内容比较，助攻改变会被识别', () => {
  const original = fields()
  const second = { ...original.events[0]!, clientEventId: 'local-event-2', minute: '60' }
  const report = fields({ homeScore: '2', events: [original.events[0]!, second] })
  assert.equal(reportFieldsEqual(report, { ...report, events: [...report.events].reverse() }), true)
  assert.equal(
    reportFieldsEqual(original, {
      ...original,
      events: [{ ...original.events[0]!, relatedPlayerId: 'home-2' }],
    }),
    false,
  )
})

test('弃权确认使用冻结规程，不猜比分，拒绝未知判罚或与规程不一致的输入', () => {
  const rule = { results: { forfeit: { winnerGoals: 3, loserGoals: 0 } } }
  const report = fields({ outcome: 'AWAY_FORFEIT', homeScore: '3', awayScore: '0', events: [] })
  assert.doesNotThrow(() => requireForfeitScore(report, rule))
  assert.throws(() => requireForfeitScore(report, {}))
  assert.throws(() => requireForfeitScore({ ...report, homeScore: '2' }, rule))
  assert.throws(() =>
    requireForfeitScore(report, { results: { forfeit: { winnerGoals: 0, loserGoals: 0 } } }),
  )
  assert.doesNotThrow(() =>
    requireForfeitScore(
      { ...report, outcome: 'HOME_FORFEIT', homeScore: '0', awayScore: '3' },
      rule,
    ),
  )
})
