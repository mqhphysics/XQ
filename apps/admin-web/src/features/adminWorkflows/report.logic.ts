import type { ReportAction, ReportFields, ReportRevision, ReportWorkspace } from './types'

export function emptyReport(): ReportFields {
  return {
    homeScore: '0',
    awayScore: '0',
    homePenaltyScore: '',
    awayPenaltyScore: '',
    outcome: 'FINISHED',
    events: [],
    notes: '',
  }
}
export function copyReport(fields: ReportFields): ReportFields {
  return { ...fields, events: fields.events.map((event) => ({ ...event })) }
}
export function createReportCommand(
  data: ReportWorkspace,
  action: ReportAction,
  fields: ReportFields,
  reason: string,
  baseVersion: number,
  clientActionId: string,
) {
  const reviewing = action === 'RETURN' || action === 'CONFIRM'
  return {
    clientActionId,
    expectedVersion: reviewing || action === 'CORRECT' ? data.reportVersion : baseVersion,
    action,
    reason: reason.trim(),
    ...(!reviewing
      ? {
          fields: copyReport(fields),
          homeRosterSnapshotId: data.homeTeam.rosterSnapshotId,
          awayRosterSnapshotId: data.awayTeam.rosterSnapshotId,
          ruleVersionId: data.ruleVersionId,
        }
      : {}),
  }
}
export function reportChanges(before: ReportRevision, after: ReportRevision): string[] {
  const changes: string[] = []
  const left = before.fields,
    right = after.fields
  if (left.homeScore !== right.homeScore || left.awayScore !== right.awayScore)
    changes.push(
      `普通比分 ${left.homeScore}:${left.awayScore} → ${right.homeScore}:${right.awayScore}`,
    )
  if (
    left.homePenaltyScore !== right.homePenaltyScore ||
    left.awayPenaltyScore !== right.awayPenaltyScore
  )
    changes.push(
      `点球比分 ${left.homePenaltyScore || '—'}:${left.awayPenaltyScore || '—'} → ${right.homePenaltyScore || '—'}:${right.awayPenaltyScore || '—'}`,
    )
  if (left.outcome !== right.outcome) changes.push(`结果判定 ${left.outcome} → ${right.outcome}`)
  if (left.notes !== right.notes) changes.push('比赛备注已修改')
  if (before.ruleVersionId !== after.ruleVersionId) changes.push('绑定规程版本已变化')
  if (
    before.homeRosterSnapshotId !== after.homeRosterSnapshotId ||
    before.awayRosterSnapshotId !== after.awayRosterSnapshotId
  )
    changes.push('绑定名单快照已变化')
  const oldEvents = new Map(left.events.map((event) => [event.clientEventId, event]))
  const newEvents = new Map(right.events.map((event) => [event.clientEventId, event]))
  for (const event of right.events) {
    const old = oldEvents.get(event.clientEventId)
    if (!old) changes.push(`新增事件：${event.minute}′ ${event.kind}`)
    else if (JSON.stringify(old) !== JSON.stringify(event))
      changes.push(`修改事件：${event.minute}′ ${event.kind}（球员、助攻/换人或时间等已变化）`)
  }
  for (const event of left.events)
    if (!newEvents.has(event.clientEventId))
      changes.push(`移除事件：${event.minute}′ ${event.kind}`)
  if (before.status !== after.status) changes.push(`状态 ${before.status} → ${after.status}`)
  if (before.reason !== after.reason) changes.push('处理原因已修改')
  return changes
}

export function validateReportCommand(
  data: ReportWorkspace,
  action: ReportAction,
  fields: ReportFields,
  reason: string,
): string | null {
  if (['RETURN', 'CORRECT'].includes(action) && reason.trim().length < 2)
    return '请填写至少两个字的处理原因。'
  if (action === 'RETURN' || action === 'CONFIRM') return null
  if (!data.ruleVersionId || !data.homeTeam.rosterSnapshotId || !data.awayTeam.rosterSnapshotId)
    return '请先完成规程和双方锁定名单配置。'
  if (
    data.latest &&
    JSON.stringify(fields) !== JSON.stringify(data.latest.fields) &&
    reason.trim().length < 2
  )
    return '修改已保存的比分或事件时，请填写至少两个字的修改原因。'
  if (fields.outcome !== 'FINISHED' && !data.latest?.reason && reason.trim().length < 2)
    return '弃权或中止的结果判定需填写至少两个字的原因。'
  if (![fields.homeScore, fields.awayScore].every((value) => /^\d{1,2}$/.test(value)))
    return '普通比分需填写 0–99 的整数。'
  if (Boolean(fields.homePenaltyScore) !== Boolean(fields.awayPenaltyScore))
    return '点球比分必须同时填写双方。'
  if (
    [fields.homePenaltyScore, fields.awayPenaltyScore].some(
      (value) => value !== '' && !/^\d{1,2}$/.test(value),
    )
  )
    return '点球比分需填写 0–99 的整数。'
  if (
    fields.homePenaltyScore &&
    (!data.isKnockout ||
      Number(fields.homeScore) !== Number(fields.awayScore) ||
      fields.outcome !== 'FINISHED')
  )
    return '点球大战仅适用于正常完赛、普通比分持平的淘汰赛。'
  if (
    fields.homePenaltyScore &&
    Number(fields.homePenaltyScore) === Number(fields.awayPenaltyScore)
  )
    return '点球大战需决出胜负。'
  if (
    action === 'SUBMIT' &&
    data.isKnockout &&
    fields.outcome === 'FINISHED' &&
    Number(fields.homeScore) === Number(fields.awayScore) &&
    !fields.homePenaltyScore
  )
    return '淘汰赛平局需填写点球大战结果。'
  const counts = { HOME: 0, AWAY: 0 }
  const ids = new Set<string>()
  for (const event of fields.events) {
    if (ids.has(event.clientEventId)) return '比赛事件编号不能重复。'
    ids.add(event.clientEventId)
    const players = event.side === 'HOME' ? data.homeTeam.players : data.awayTeam.players
    if (!players.some((player) => player.id === event.playerId))
      return '请为每个事件选择绑定名单中的球员。'
    if (event.relatedPlayerId && !players.some((player) => player.id === event.relatedPlayerId))
      return '关联球员需来自同一方锁定名单。'
    if (event.playerId === event.relatedPlayerId) return '事件球员与助攻或换上球员不能相同。'
    if (
      !/^\d{1,3}$/.test(event.minute) ||
      Number(event.minute) > 120 ||
      (event.addedMinute &&
        (!/^\d{1,2}$/.test(event.addedMinute) || Number(event.addedMinute) > 30))
    )
      return '事件分钟范围为 0–120，补时为 0–30。'
    if (event.kind === 'SUBSTITUTION' && !event.relatedPlayerId)
      return '换人需选择换下及换上两名球员。'
    if (event.relatedPlayerId && !['GOAL', 'SUBSTITUTION'].includes(event.kind))
      return '该事件类型无需关联球员。'
    if (event.kind === 'GOAL') counts[event.side] += 1
    if (event.kind === 'OWN_GOAL') counts[event.side === 'HOME' ? 'AWAY' : 'HOME'] += 1
  }
  if (
    fields.outcome === 'FINISHED' &&
    (counts.HOME > Number(fields.homeScore) || counts.AWAY > Number(fields.awayScore))
  )
    return '进球事件数量不能超过普通比分。'
  if (
    action === 'SUBMIT' &&
    fields.outcome === 'FINISHED' &&
    (counts.HOME !== Number(fields.homeScore) || counts.AWAY !== Number(fields.awayScore))
  )
    return '提交前请补齐与普通比分一致的进球事件。'
  return null
}
