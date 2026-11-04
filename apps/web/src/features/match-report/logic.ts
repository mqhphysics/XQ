import type {
  LocalReportDraft,
  ReportEvent,
  ReportFields,
  ReportWorkspace,
  SaveReportCommand,
  Side,
} from './types.ts'

export const EVENT_LABELS = {
  GOAL: '进球',
  OWN_GOAL: '乌龙球',
  YELLOW_CARD: '黄牌',
  RED_CARD: '红牌',
  SUBSTITUTION: '换人',
} as const
export const OUTCOME_LABELS = {
  FINISHED: '正常完赛',
  HOME_FORFEIT: '主队弃权',
  AWAY_FORFEIT: '客队弃权',
  ABANDONED: '比赛中止',
} as const
export const STATUS_LABELS = {
  DRAFT: '已保存，待补全',
  SUBMITTED: '待审核',
  RETURNED: '已退回',
  CONFIRMED: '已确认',
} as const

export function emptyFields(): ReportFields {
  return {
    homeScore: '',
    awayScore: '',
    homePenaltyScore: '',
    awayPenaltyScore: '',
    outcome: 'FINISHED',
    events: [],
    notes: '',
  }
}

export function cloneFields(fields: ReportFields): ReportFields {
  return { ...fields, events: fields.events.map((event) => ({ ...event })) }
}

export function creditedSide(event: ReportEvent): Side {
  return event.kind === 'OWN_GOAL' ? (event.side === 'HOME' ? 'AWAY' : 'HOME') : event.side
}

export function goalCounts(fields: ReportFields): Record<Side, number> {
  const counts = { HOME: 0, AWAY: 0 }
  for (const event of fields.events) {
    if (event.kind === 'GOAL' || event.kind === 'OWN_GOAL') counts[creditedSide(event)] += 1
  }
  return counts
}

export function fieldsEqual(left: ReportFields, right: ReportFields): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
}

function canonical(fields: ReportFields) {
  return {
    homeScore: fields.homeScore,
    awayScore: fields.awayScore,
    homePenaltyScore: fields.homePenaltyScore,
    awayPenaltyScore: fields.awayPenaltyScore,
    outcome: fields.outcome,
    notes: fields.notes,
    events: [...fields.events]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((event) => ({
        id: event.id,
        kind: event.kind,
        side: event.side,
        minute: event.minute,
        addedMinute: event.addedMinute,
        playerId: event.playerId,
        relatedPlayerId: event.relatedPlayerId,
      })),
  }
}

export function describeChanges(before: ReportFields, after: ReportFields): string[] {
  const changes: string[] = []
  if (before.homeScore !== after.homeScore || before.awayScore !== after.awayScore) {
    changes.push(`比分 ${scoreText(before)} → ${scoreText(after)}`)
  }
  if (before.outcome !== after.outcome)
    changes.push(`结果 ${OUTCOME_LABELS[before.outcome]} → ${OUTCOME_LABELS[after.outcome]}`)
  if (before.notes !== after.notes) changes.push('比赛说明已修改')
  if (
    before.homePenaltyScore !== after.homePenaltyScore ||
    before.awayPenaltyScore !== after.awayPenaltyScore
  )
    changes.push(
      `点球 ${before.homePenaltyScore || '—'} : ${before.awayPenaltyScore || '—'} → ${after.homePenaltyScore || '—'} : ${after.awayPenaltyScore || '—'}`,
    )
  const previous = new Map(before.events.map((event) => [event.id, event]))
  const current = new Map(after.events.map((event) => [event.id, event]))
  let added = 0,
    removed = 0,
    edited = 0
  for (const [id, event] of current) {
    const old = previous.get(id)
    if (!old) added += 1
    else if (!fieldsEqual({ ...before, events: [old] }, { ...before, events: [event] })) edited += 1
  }
  for (const id of previous.keys()) if (!current.has(id)) removed += 1
  if (added || removed || edited)
    changes.push(`事件：新增 ${added} 条，修改 ${edited} 条，删除 ${removed} 条`)
  return changes
}

export function scoreText(fields: ReportFields): string {
  return `${fields.homeScore || '—'} : ${fields.awayScore || '—'}`
}

export interface ValidationIssue {
  field: string
  message: string
}
const integer = (value: string, max: number) =>
  /^\d{1,3}$/.test(value) && value.length <= String(max).length && Number(value) <= max

export function validateReport(
  fields: ReportFields,
  workspace: ReportWorkspace,
  submit: boolean,
  reason: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const add = (field: string, message: string) => issues.push({ field, message })
  if (!integer(fields.homeScore, 99)) add('homeScore', '请填写 0–99 的主队比分')
  if (!integer(fields.awayScore, 99)) add('awayScore', '请填写 0–99 的客队比分')
  const homePenalty = fields.homePenaltyScore !== '',
    awayPenalty = fields.awayPenaltyScore !== ''
  if (homePenalty !== awayPenalty) add('homePenaltyScore', '点球大战请同时填写双方比分')
  if (
    homePenalty &&
    (!integer(fields.homePenaltyScore, 99) || !integer(fields.awayPenaltyScore, 99))
  )
    add('homePenaltyScore', '点球比分应为 0–99 的整数')
  if (
    homePenalty &&
    (!workspace.isKnockout ||
      fields.outcome !== 'FINISHED' ||
      Number(fields.homeScore) !== Number(fields.awayScore))
  )
    add('homePenaltyScore', '点球大战仅用于常规比分持平的正常完赛淘汰赛')
  if (homePenalty && Number(fields.homePenaltyScore) === Number(fields.awayPenaltyScore))
    add('homePenaltyScore', '点球大战必须决出胜负')
  if (
    submit &&
    workspace.isKnockout &&
    fields.outcome === 'FINISHED' &&
    Number(fields.homeScore) === Number(fields.awayScore) &&
    !homePenalty
  )
    add('homePenaltyScore', '淘汰赛平局需补充点球大战结果')
  if (!(fields.outcome in OUTCOME_LABELS)) add('outcome', '请选择比赛结果')
  if (fields.outcome !== 'FINISHED' && !workspace.latest?.reason && reason.trim().length < 2)
    add('reason', '请说明弃权或中止原因')
  if (workspace.latest && !fieldsEqual(workspace.latest.fields, fields) && reason.trim().length < 2)
    add('reason', '请填写本次修改原因，方便之后核对')
  if (reason.length > 240) add('reason', '修改原因最多 240 字')
  if (fields.notes.length > 800) add('notes', '比赛说明最多 800 字')
  if (fields.events.length > 500) add('events', '比赛事件最多 500 条')
  const ids = new Set<string>()
  const facts = new Set<string>()
  fields.events.forEach((event, index) => {
    const key = `event-${event.id}`
    const prefix = `第 ${index + 1} 条事件：`
    if (!event.id || ids.has(event.id)) add(key, prefix + '事件标识重复或缺失')
    ids.add(event.id)
    if (!(event.kind in EVENT_LABELS) || !['HOME', 'AWAY'].includes(event.side)) {
      add(key, prefix + '类型或球队无效')
      return
    }
    if (!integer(event.minute, 120)) add(key, prefix + '请填写 0–120 的比赛分钟')
    if (event.addedMinute && !integer(event.addedMinute, 30))
      add(key, prefix + '补时应为 0–30 分钟')
    const team = event.side === 'HOME' ? workspace.homeTeam : workspace.awayTeam
    if (!team.rosterSnapshotId) add(key, prefix + '该队还没有锁定名单，暂时不能录入球员事件')
    if (!team.players.some((player) => player.id === event.playerId))
      add(key, prefix + '请选择该队锁定名单中的球员')
    if (
      event.relatedPlayerId &&
      !team.players.some((player) => player.id === event.relatedPlayerId)
    )
      add(key, prefix + '关联球员不在该队锁定名单中')
    if (event.relatedPlayerId && event.relatedPlayerId === event.playerId)
      add(key, prefix + '不能选择同一位球员')
    if (event.kind === 'SUBSTITUTION' && !event.relatedPlayerId) add(key, prefix + '请选择换上球员')
    if (event.kind !== 'GOAL' && event.kind !== 'SUBSTITUTION' && event.relatedPlayerId)
      add(key, prefix + '此事件不需要关联球员')
    if (event.playerId && integer(event.minute, 120)) {
      const fact = JSON.stringify([
        event.kind,
        event.side,
        Number(event.minute),
        Number(event.addedMinute || '0'),
        event.playerId,
        event.relatedPlayerId,
      ])
      if (facts.has(fact)) add(key, prefix + '与另一条事件相同，请撤销多录的一条')
      facts.add(fact)
    }
  })
  issues.push(...validateSubstitutionSequence(fields.events))
  if (fields.outcome === 'FINISHED') {
    const goals = goalCounts(fields)
    for (const side of ['HOME', 'AWAY'] as const) {
      const score = side === 'HOME' ? fields.homeScore : fields.awayScore
      if (
        integer(score, 99) &&
        (goals[side] > Number(score) || (submit && goals[side] !== Number(score)))
      ) {
        add(
          'events',
          `${side === 'HOME' ? '主队' : '客队'}比分为 ${score}，进球明细为 ${goals[side]}；${submit ? '请核对一致后提交审核' : '请先核对比分或删除多录的进球'}`,
        )
      }
    }
  }
  return issues
}

function validateSubstitutionSequence(events: ReportEvent[]): ValidationIssue[] {
  const swaps = events
    .filter(
      (event) =>
        event.kind === 'SUBSTITUTION' &&
        event.playerId &&
        event.relatedPlayerId &&
        integer(event.minute, 120),
    )
    .sort(
      (a, b) =>
        Number(a.minute) - Number(b.minute) || Number(a.addedMinute) - Number(b.addedMinute),
    )
  const known = new Map<string, 'ON' | 'OFF'>()
  const issues: ValidationIssue[] = []
  for (let index = 0; index < swaps.length; ) {
    const first = swaps[index]!
    const movements = new Map<string, { on: number; off: number; eventId: string }>()
    while (index < swaps.length) {
      const event = swaps[index]!
      if (
        Number(event.minute) !== Number(first.minute) ||
        Number(event.addedMinute) !== Number(first.addedMinute)
      )
        break
      for (const [playerId, direction] of [
        [event.playerId, 'off'],
        [event.relatedPlayerId, 'on'],
      ] as const) {
        const key = `${event.side}:${playerId}`
        const movement = movements.get(key) ?? { on: 0, off: 0, eventId: event.id }
        movement[direction] += 1
        movement.eventId = event.id
        movements.set(key, movement)
      }
      index += 1
    }
    for (const [key, movement] of movements) {
      if (movement.on > 1 || movement.off > 1) {
        issues.push({
          field: `event-${movement.eventId}`,
          message: '同一球员不能在同一分钟重复换上或换下',
        })
        continue
      }
      if (movement.on && movement.off) continue
      const next = movement.on ? 'ON' : 'OFF'
      if (known.get(key) === next)
        issues.push({
          field: `event-${movement.eventId}`,
          message:
            next === 'ON'
              ? '该球员已换上，请核对是否漏录换下事件'
              : '该球员已换下，请核对是否漏录换上事件',
        })
      known.set(key, next)
    }
  }
  return issues
}

export function createSaveCommand(
  fields: ReportFields,
  expectedVersion: number,
  action: SaveReportCommand['action'],
  reason: string,
  clientActionId: string,
  binding: { homeRosterSnapshotId: string; awayRosterSnapshotId: string; ruleVersionId: string } = {
    homeRosterSnapshotId: '',
    awayRosterSnapshotId: '',
    ruleVersionId: '',
  },
): SaveReportCommand {
  return {
    ...binding,
    fields: cloneFields(fields),
    expectedVersion,
    action,
    reason: reason.trim(),
    clientActionId,
  }
}

export function draftDecision(
  draft: LocalReportDraft | null,
  serverVersion: number,
): 'NONE' | 'RESTORE' | 'CONFLICT' | 'RETRY' {
  if (!draft || !Number.isFinite(Date.parse(draft.savedAt))) return 'NONE'
  // A lost response can mean the server already committed. Replay the exact command first.
  if (draft.pending) return 'RETRY'
  return draft.baseVersion === serverVersion ? 'RESTORE' : 'CONFLICT'
}
