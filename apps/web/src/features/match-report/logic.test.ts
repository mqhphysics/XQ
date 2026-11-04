import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cloneFields,
  createSaveCommand,
  describeChanges,
  draftDecision,
  emptyFields,
  fieldsEqual,
  goalCounts,
  validateReport,
} from './logic.ts'
import type { LocalReportDraft, ReportEvent, ReportFields, ReportWorkspace } from './types.ts'

function workspace(): ReportWorkspace {
  return {
    organizationId: 'org-a',
    matchId: 'match-a',
    title: '模拟测试比赛，非实测',
    ruleVersionId: 'test-rule',
    isKnockout: false,
    homeTeam: {
      id: 'home',
      name: '主队',
      rosterSnapshotId: 'locked-home',
      players: [
        { id: 'h1', displayName: '测试球员一', shirtNumber: '9' },
        { id: 'h2', displayName: '测试球员二', shirtNumber: '7' },
      ],
    },
    awayTeam: {
      id: 'away',
      name: '客队',
      rosterSnapshotId: 'locked-away',
      players: [{ id: 'a1', displayName: '测试球员三', shirtNumber: '10' }],
    },
    permissions: {
      canEdit: true,
      canSubmit: true,
      canViewHistory: true,
      canCorrect: false,
      canConfirm: false,
      canReturn: false,
    },
    latest: null,
    reviewNote: null,
  }
}
function goal(patch: Partial<ReportEvent> = {}): ReportEvent {
  return {
    id: 'event-a',
    kind: 'GOAL',
    side: 'HOME',
    minute: '45',
    addedMinute: '2',
    playerId: 'h1',
    relatedPlayerId: '',
    ...patch,
  }
}
function fields(patch: Partial<ReportFields> = {}): ReportFields {
  return { ...emptyFields(), homeScore: '1', awayScore: '0', events: [goal()], ...patch }
}

test('比分为空与明确 0:0 不等价，不会默认提交 0:0', () => {
  assert.equal(emptyFields().homeScore, '')
  assert.equal(
    validateReport(emptyFields(), workspace(), true, '').filter((issue) =>
      issue.field.endsWith('Score'),
    ).length,
    2,
  )
  assert.deepEqual(
    validateReport(fields({ homeScore: '0', events: [] }), workspace(), true, ''),
    [],
  )
})
test('比分拒绝负数、小数、指数、空格与超上限数值', () => {
  for (const invalid of ['-1', '1.5', '1e1', ' 1', '100', 'NaN']) {
    assert.ok(
      validateReport(fields({ homeScore: invalid }), workspace(), false, '').some(
        (issue) => issue.field === 'homeScore',
      ),
      invalid,
    )
  }
})
test('明细未补全可保存，提交审核要求比分一致', () => {
  const partial = fields({ homeScore: '2' })
  assert.deepEqual(validateReport(partial, workspace(), false, ''), [])
  assert.ok(
    validateReport(partial, workspace(), true, '').some((issue) => issue.field === 'events'),
  )
})
test('保存草稿也不能让进球明细超过比分', () => {
  assert.ok(
    validateReport(fields({ homeScore: '0' }), workspace(), false, '').some(
      (issue) => issue.field === 'events',
    ),
  )
})
test('乌龙球算给对方，球员仍来自实际球队锁定名单', () => {
  const report = fields({ homeScore: '0', awayScore: '1', events: [goal({ kind: 'OWN_GOAL' })] })
  assert.deepEqual(goalCounts(report), { HOME: 0, AWAY: 1 })
  assert.deepEqual(validateReport(report, workspace(), true, ''), [])
})
test('跨队球员与未锁定名单均被拒绝', () => {
  assert.ok(
    validateReport(fields({ events: [goal({ playerId: 'a1' })] }), workspace(), true, '').some(
      (issue) => issue.message.includes('锁定名单'),
    ),
  )
  const data = workspace()
  data.homeTeam.rosterSnapshotId = null
  assert.ok(
    validateReport(fields(), data, false, '').some((issue) =>
      issue.message.includes('没有锁定名单'),
    ),
  )
})
test('助攻与换人不能选择本人；换人必须有换上球员', () => {
  assert.ok(
    validateReport(
      fields({ events: [goal({ relatedPlayerId: 'h1' })] }),
      workspace(),
      true,
      '',
    ).some((issue) => issue.message.includes('同一位')),
  )
  assert.ok(
    validateReport(
      fields({ events: [goal({ kind: 'SUBSTITUTION' })] }),
      workspace(),
      false,
      '',
    ).some((issue) => issue.message.includes('换上')),
  )
})
test('红黄牌不能携带隐藏的助攻字段', () => {
  assert.ok(
    validateReport(
      fields({ events: [goal({ kind: 'YELLOW_CARD', relatedPlayerId: 'h2' })] }),
      workspace(),
      false,
      '',
    ).some((issue) => issue.message.includes('不需要关联球员')),
  )
})
test('事件标识去重；分钟与补时分别校验', () => {
  const invalid = fields({
    homeScore: '2',
    events: [goal({ minute: '121', addedMinute: '31' }), goal()],
  })
  const issues = validateReport(invalid, workspace(), true, '')
  assert.ok(issues.some((issue) => issue.message.includes('重复')))
  assert.ok(issues.some((issue) => issue.message.includes('0–120')))
  assert.ok(issues.some((issue) => issue.message.includes('0–30')))
})
test('相同事件不能通过更换本地标识和数字格式重复录入', () => {
  assert.ok(
    validateReport(
      fields({
        homeScore: '2',
        events: [goal(), goal({ id: 'new-id', minute: '045', addedMinute: '02' })],
      }),
      workspace(),
      false,
      '',
    ).some((issue) => issue.message.includes('另一条事件相同')),
  )
})
test('换人校验接受替补先上后下，拒绝漏录的重复上下场，不依赖事件数组顺序', () => {
  const data = workspace()
  data.homeTeam.players.push({ id: 'h3', displayName: '测试第三人', shirtNumber: '11' })
  const first = goal({
    id: 'swap-first',
    kind: 'SUBSTITUTION',
    minute: '50',
    addedMinute: '',
    playerId: 'h1',
    relatedPlayerId: 'h2',
  })
  const second = goal({
    id: 'swap-second',
    kind: 'SUBSTITUTION',
    minute: '70',
    addedMinute: '',
    playerId: 'h2',
    relatedPlayerId: 'h3',
  })
  assert.deepEqual(
    validateReport(fields({ homeScore: '0', events: [second, first] }), data, true, ''),
    [],
  )
  assert.ok(
    validateReport(
      fields({ homeScore: '0', events: [first, { ...second, playerId: 'h1' }] }),
      data,
      false,
      '',
    ).some((issue) => issue.message.includes('已换下')),
  )
  assert.ok(
    validateReport(
      fields({
        homeScore: '0',
        events: [first, { ...second, playerId: 'h3', relatedPlayerId: 'h2' }],
      }),
      data,
      false,
      '',
    ).some((issue) => issue.message.includes('已换上')),
  )
})
test('比分 2:1 改 1:1 可对比，修改已有报告须填原因', () => {
  const before = fields({ homeScore: '2', awayScore: '1', events: [] })
  const after = fields({ homeScore: '1', awayScore: '1', events: [] })
  const data = workspace()
  data.latest = {
    version: 1,
    savedAt: '2026-10-02T00:00:00Z',
    savedBy: '测试信息员',
    homeRosterSnapshotId: 'locked-home',
    awayRosterSnapshotId: 'locked-away',
    ruleVersionId: 'test-rule',
    status: 'DRAFT',
    reason: '',
    fields: before,
  }
  assert.ok(describeChanges(before, after).includes('比分 2 : 1 → 1 : 1'))
  assert.ok(validateReport(after, data, false, '').some((issue) => issue.field === 'reason'))
  assert.deepEqual(validateReport(after, data, false, '核对裁判记录'), [])
})
test('事件数相同但球员、时间或助攻变化仍算修改', () => {
  for (const patch of [{ playerId: 'h2' }, { minute: '46' }, { relatedPlayerId: 'h2' }]) {
    const before = fields(),
      after = fields({ events: [goal(patch)] })
    assert.equal(fieldsEqual(before, after), false)
    assert.ok(describeChanges(before, after).some((change) => change.includes('修改 1 条')))
  }
})
test('对比分与事件深拷贝，不会覆盖历史快照或已发送请求', () => {
  const original = fields(),
    copy = cloneFields(original)
  const command = createSaveCommand(original, 7, 'SAVE', '  核对记录  ', 'fixed-id')
  copy.events[0]!.playerId = 'h2'
  original.events[0]!.minute = '50'
  original.homeScore = '2'
  assert.equal(command.fields.events[0]!.minute, '45')
  assert.equal(command.fields.homeScore, '1')
  assert.equal(command.clientActionId, 'fixed-id')
  assert.equal(command.expectedVersion, 7)
  assert.equal(command.reason, '核对记录')
})
test('服务端可能已保存但断网时，即使版本增加也应重放原请求核对', () => {
  const draft: LocalReportDraft = {
    schemaVersion: 1,
    baseVersion: 1,
    savedAt: '2026-10-02T00:00:00Z',
    fields: fields(),
    reason: '',
    pending: createSaveCommand(fields(), 1, 'SAVE', '', 'retry-id'),
  }
  assert.equal(draftDecision(draft, 2), 'RETRY')
  const retry = JSON.parse(JSON.stringify(draft)) as LocalReportDraft
  assert.deepEqual(retry.pending, draft.pending)
  assert.equal(retry.pending?.clientActionId, 'retry-id')
})
test('普通本地草稿按基线版本恢复，冲突与无效草稿分开', () => {
  const draft: LocalReportDraft = {
    schemaVersion: 1,
    baseVersion: 1,
    savedAt: '2026-10-02T00:00:00Z',
    fields: fields(),
    reason: '',
    pending: null,
  }
  assert.equal(draftDecision(draft, 1), 'RESTORE')
  assert.equal(draftDecision(draft, 2), 'CONFLICT')
  assert.equal(draftDecision({ ...draft, savedAt: 'invalid' }, 1), 'NONE')
  assert.equal(draftDecision(null, 1), 'NONE')
})
test('弃权、中止必须说明原因，不自行指定规程判定比分', () => {
  assert.ok(
    validateReport(fields({ outcome: 'ABANDONED' }), workspace(), false, '').some(
      (issue) => issue.field === 'reason',
    ),
  )
  assert.deepEqual(
    validateReport(
      fields({ homeScore: '3', awayScore: '0', outcome: 'AWAY_FORFEIT', events: [] }),
      workspace(),
      true,
      '客队未到场',
    ),
    [],
  )
})
