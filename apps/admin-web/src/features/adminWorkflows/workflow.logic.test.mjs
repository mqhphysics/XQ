import test from 'node:test'
import assert from 'node:assert/strict'
import {
  copyReport,
  createReportCommand,
  emptyReport,
  reportChanges,
  validateReportCommand,
} from './report.logic.ts'
import { validateRuleDocument } from './rule.logic.ts'

const homePlayer = '11111111-1111-4111-8111-111111111111'
const awayPlayer = '22222222-2222-4222-8222-222222222222'
const ruleId = '33333333-3333-4333-8333-333333333333'
const data = {
  reportVersion: 8,
  ruleVersionId: ruleId,
  isKnockout: false,
  latest: null,
  homeTeam: { rosterSnapshotId: 'home-snapshot', players: [{ id: homePlayer }] },
  awayTeam: { rosterSnapshotId: 'away-snapshot', players: [{ id: awayPlayer }] },
}
const event = {
  clientEventId: 'goal-1',
  kind: 'GOAL',
  side: 'HOME',
  minute: '23',
  addedMinute: '',
  playerId: homePlayer,
  relatedPlayerId: '',
}
const revision = {
  version: 1,
  status: 'DRAFT',
  action: 'SAVE',
  reason: '',
  fields: { ...emptyReport(), homeScore: '1', events: [event] },
  ruleVersionId: ruleId,
  homeRosterSnapshotId: 'home-snapshot',
  awayRosterSnapshotId: 'away-snapshot',
}

test('审核只发送当前版本与处理指令，禁止注入比分或绑定资料', () => {
  for (const action of ['RETURN', 'CONFIRM']) {
    const command = createReportCommand(
      data,
      action,
      emptyReport(),
      '  核对完成  ',
      4,
      'original-request',
    )
    assert.deepEqual(command, {
      clientActionId: 'original-request',
      expectedVersion: 8,
      action,
      reason: '核对完成',
    })
  }
})
test('保存保留草稿基线和完整快照；更正使用当前确认版本', () => {
  const fields = copyReport(revision.fields)
  const command = createReportCommand(data, 'SAVE', fields, '调整时间', 4, 'original-request')
  fields.events[0].minute = '45'
  assert.equal(command.expectedVersion, 4)
  assert.equal(command.fields.events[0].minute, '23')
  assert.equal(command.homeRosterSnapshotId, 'home-snapshot')
  assert.equal(
    createReportCommand(data, 'CORRECT', revision.fields, '核对更正', 4, 'original-request')
      .expectedVersion,
    8,
  )
})
test('版本对比能识别同样事件数量中的球员和时间变化', () => {
  const newer = {
    ...revision,
    version: 2,
    fields: {
      ...revision.fields,
      events: [{ ...event, minute: '26', relatedPlayerId: awayPlayer }],
    },
  }
  assert.ok(reportChanges(revision, newer).some((change) => change.includes('修改事件')))
})
test('草稿允许进球明细暂缺，提交必须与比分相符', () => {
  const fields = { ...emptyReport(), homeScore: '1' }
  assert.equal(validateReportCommand(data, 'SAVE', fields, ''), null)
  assert.match(validateReportCommand(data, 'SUBMIT', fields, ''), /补齐/)
  assert.equal(validateReportCommand(data, 'SUBMIT', revision.fields, ''), null)
})
test('换人必须选择本队两名不同球员，退回与更正需要原因', () => {
  const fields = { ...emptyReport(), events: [{ ...event, kind: 'SUBSTITUTION' }] }
  assert.match(validateReportCommand(data, 'SAVE', fields, ''), /换人/)
  assert.match(validateReportCommand(data, 'RETURN', emptyReport(), ''), /处理原因/)
  assert.match(validateReportCommand(data, 'CORRECT', emptyReport(), ''), /处理原因/)
})
test('点球单独计分，仅允许普通比分持平的淘汰赛', () => {
  const fields = { ...emptyReport(), homePenaltyScore: '4', awayPenaltyScore: '3' }
  assert.match(validateReportCommand(data, 'SAVE', fields, ''), /淘汰赛/)
  assert.equal(validateReportCommand({ ...data, isKnockout: true }, 'SUBMIT', fields, ''), null)
  assert.match(
    validateReportCommand({ ...data, isKnockout: true }, 'SUBMIT', emptyReport(), ''),
    /点球大战/,
  )
})
const rules = {
  roster: {
    minPlayers: 1,
    maxPlayers: 11,
    eligiblePlayerIds: [homePlayer, awayPlayer],
    submissionDeadline: '2027-01-01T00:00:00+08:00',
    playersOnPitch: 8,
  },
  results: {
    points: { win: 3, draw: 1, loss: 0 },
    tieBreakers: ['GOAL_DIFFERENCE'],
    headToHead: { criteria: [], reapplyToRemainingTeams: false },
    groupShootout: 'REJECT',
    knockoutShootout: 'ALLOWED',
    forfeit: { winnerGoals: 3, loserGoals: 0, loserPoints: 0, both: null },
  },
}
test('完整名单与结果规程可通过结构检查，summary占位被拒绝', () => {
  assert.equal(validateRuleDocument(rules), null)
  assert.match(validateRuleDocument({ summary: '规则待定' }), /完整/)
  assert.match(
    validateRuleDocument({ ...rules, results: { ...rules.results, fakeSetting: true } }),
    /不支持/,
  )
})
test('新规程只允许八人制，省略人数时由服务器固定八人制', () => {
  for (const playersOnPitch of [5, 7, 11, '8', null])
    assert.match(
      validateRuleDocument({ ...rules, roster: { ...rules.roster, playersOnPitch } }),
      /八人制/,
    )
  const { playersOnPitch, ...roster } = rules.roster
  assert.equal(playersOnPitch, 8)
  assert.equal(validateRuleDocument({ ...rules, roster }), null)
})
test('资格ID、时区、排序条件和晋级位置必须有效且无重复', () => {
  assert.match(
    validateRuleDocument({
      ...rules,
      roster: { ...rules.roster, eligiblePlayerIds: [homePlayer, homePlayer] },
    }),
    /不重复/,
  )
  assert.match(
    validateRuleDocument({
      ...rules,
      roster: { ...rules.roster, submissionDeadline: '2027-01-01T00:00:00' },
    }),
    /时区/,
  )
  assert.match(
    validateRuleDocument({
      ...rules,
      results: { ...rules.results, tieBreakers: ['GOAL_DIFFERENCE', 'GOAL_DIFFERENCE'] },
    }),
    /不能重复/,
  )
  const slot = {
    targetMatchId: homePlayer,
    side: 'HOME',
    source: { type: 'MATCH_WINNER', matchId: awayPlayer },
  }
  assert.match(
    validateRuleDocument({ ...rules, progression: { sourceStageId: ruleId, slots: [slot, slot] } }),
    /重复分配/,
  )
})
