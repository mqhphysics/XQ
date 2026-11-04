import type { ReportAction, ReportFieldsDto } from './match-report.dto'

export type ReportStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'CONFIRMED'
export interface FrozenReportContext {
  homePlayerIds: ReadonlySet<string>
  awayPlayerIds: ReadonlySet<string>
  isKnockout: boolean
}

export class ReportRuleError extends Error {}

export function nextReportStatus(
  previous: ReportStatus | null,
  action: ReportAction,
  administrator: boolean,
): ReportStatus {
  if (action === 'RETURN' || action === 'CONFIRM') {
    if (!administrator) throw new ReportRuleError('只有授权赛事管理员可以审核比赛报告')
    if (previous !== 'SUBMITTED')
      throw new ReportRuleError('只能审核已提交的报告，请先核对最新版本')
    return action === 'RETURN' ? 'RETURNED' : 'CONFIRMED'
  }
  if (action === 'CORRECT') {
    if (!administrator || previous !== 'CONFIRMED')
      throw new ReportRuleError('已确认结果只能由管理员填写原因后启动修正')
    return 'DRAFT'
  }
  if (previous === 'CONFIRMED')
    throw new ReportRuleError('已确认报告不可直接覆盖，请由管理员启动修正')
  if (previous === 'SUBMITTED') throw new ReportRuleError('报告正在审核，需退回后才能重新录入')
  return action === 'SUBMIT' ? 'SUBMITTED' : 'DRAFT'
}

export function validateReportFields(
  fields: ReportFieldsDto,
  context: FrozenReportContext,
  complete: boolean,
  allowPlaceholders = false,
): void {
  if (!['FINISHED', 'HOME_FORFEIT', 'AWAY_FORFEIT', 'ABANDONED'].includes(fields.outcome))
    throw new ReportRuleError('比赛结果无效')
  if (fields.events.length > 500 || fields.notes.length > 800)
    throw new ReportRuleError('报告内容超过允许长度')
  const score = (value: string) => /^\d{1,2}$/.test(value) && Number(value) <= 99
  if (!score(fields.homeScore) || !score(fields.awayScore))
    throw new ReportRuleError('比分必须为 0–99 的整数')
  const hasHomePenalty = fields.homePenaltyScore !== '',
    hasAwayPenalty = fields.awayPenaltyScore !== ''
  if (hasHomePenalty !== hasAwayPenalty) throw new ReportRuleError('点球大战必须同时填写双方比分')
  if (hasHomePenalty && (!score(fields.homePenaltyScore) || !score(fields.awayPenaltyScore)))
    throw new ReportRuleError('点球比分必须为 0–99 的整数')
  if (
    hasHomePenalty &&
    (fields.outcome !== 'FINISHED' ||
      !context.isKnockout ||
      Number(fields.homeScore) !== Number(fields.awayScore))
  )
    throw new ReportRuleError('点球大战仅用于正常完赛、常规比分持平的淘汰赛')
  if (hasHomePenalty && Number(fields.homePenaltyScore) === Number(fields.awayPenaltyScore))
    throw new ReportRuleError('点球大战必须决出胜负')
  if (
    complete &&
    context.isKnockout &&
    fields.outcome === 'FINISHED' &&
    Number(fields.homeScore) === Number(fields.awayScore) &&
    !hasHomePenalty
  )
    throw new ReportRuleError('淘汰赛平局需补充点球大战结果')
  const ids = new Set<string>(),
    facts = new Set<string>(),
    counts = { HOME: 0, AWAY: 0 }
  for (const event of fields.events) {
    if (
      !['HOME', 'AWAY'].includes(event.side) ||
      !['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION'].includes(event.kind)
    )
      throw new ReportRuleError('事件球队或类型无效')
    if (!event.clientEventId || ids.has(event.clientEventId))
      throw new ReportRuleError('事件标识必须唯一')
    ids.add(event.clientEventId)
    if (
      (!(allowPlaceholders && event.minute === '') && !/^\d{1,3}$/.test(event.minute)) ||
      Number(event.minute) > 120 ||
      (event.addedMinute !== '' &&
        (!/^\d{1,2}$/.test(event.addedMinute) || Number(event.addedMinute) > 30))
    )
      throw new ReportRuleError('比赛分钟或补时无效')
    const players = event.side === 'HOME' ? context.homePlayerIds : context.awayPlayerIds
    if (
      (!(allowPlaceholders && event.playerId === '') && !players.has(event.playerId)) ||
      (event.relatedPlayerId !== '' && !players.has(event.relatedPlayerId))
    )
      throw new ReportRuleError('事件球员必须来自本次报告绑定的对应球队锁定名单')
    if (event.relatedPlayerId && event.relatedPlayerId === event.playerId)
      throw new ReportRuleError('事件球员与关联球员不能相同')
    if (event.kind === 'SUBSTITUTION' && !event.relatedPlayerId && !allowPlaceholders)
      throw new ReportRuleError('换人必须同时填写换下与换上球员')
    if (event.relatedPlayerId && event.kind !== 'GOAL' && event.kind !== 'SUBSTITUTION')
      throw new ReportRuleError('该事件不需要关联球员')
    // A new client ID must not turn a repeated form entry into a second match fact.
    const fact = JSON.stringify([
      event.kind,
      event.side,
      Number(event.minute),
      Number(event.addedMinute || '0'),
      event.playerId,
      event.relatedPlayerId,
    ])
    if (event.minute !== '' && event.playerId !== '' && facts.has(fact))
      throw new ReportRuleError('同一球队、球员、分钟的相同事件重复，请撤销多录的一条')
    if (event.minute !== '' && event.playerId !== '') facts.add(fact)
    if (event.kind === 'GOAL' || event.kind === 'OWN_GOAL') {
      const side =
        event.kind === 'OWN_GOAL' ? (event.side === 'HOME' ? 'AWAY' : 'HOME') : event.side
      counts[side] += 1
    }
  }
  validateSubstitutionSequence(
    fields.events.filter((event) => event.minute && event.playerId && event.relatedPlayerId),
  )
  if (
    fields.outcome === 'FINISHED' &&
    (counts.HOME > Number(fields.homeScore) ||
      counts.AWAY > Number(fields.awayScore) ||
      (complete &&
        (counts.HOME !== Number(fields.homeScore) || counts.AWAY !== Number(fields.awayScore))))
  )
    throw new ReportRuleError(
      complete ? '进球明细与普通比分不一致，请核对后提交' : '进球明细超过比分，不能保存',
    )
}

function validateSubstitutionSequence(events: ReportFieldsDto['events']): void {
  // A roster is not a starting XI. Infer only positions established by reported swaps.
  // Group equal match clocks so same-minute double swaps do not depend on client ID order.
  const swaps = events
    .filter((event) => event.kind === 'SUBSTITUTION')
    .sort(
      (a, b) =>
        Number(a.minute) - Number(b.minute) || Number(a.addedMinute) - Number(b.addedMinute),
    )
  const known = new Map<string, 'ON' | 'OFF'>()
  for (let index = 0; index < swaps.length; ) {
    const first = swaps[index]!
    const movements = new Map<string, { on: number; off: number }>()
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
        const movement = movements.get(key) ?? { on: 0, off: 0 }
        movement[direction] += 1
        movements.set(key, movement)
      }
      index += 1
    }
    for (const [key, movement] of movements) {
      if (movement.on > 1 || movement.off > 1)
        throw new ReportRuleError('同一球员不能在同一分钟重复换上或换下')
      // Both at the same clock is a valid short appearance or re-entry; chronology is unknown.
      if (movement.on && movement.off) continue
      const next = movement.on ? 'ON' : 'OFF'
      if (known.get(key) === next)
        throw new ReportRuleError(
          next === 'ON'
            ? '该球员已换上，请核对是否漏录换下事件'
            : '该球员已换下，请核对是否漏录换上事件',
        )
      known.set(key, next)
    }
  }
}

export function reportFieldsEqual(left: ReportFieldsDto, right: ReportFieldsDto): boolean {
  return JSON.stringify(canonicalFields(left)) === JSON.stringify(canonicalFields(right))
}
export function canonicalFields(fields: ReportFieldsDto) {
  return {
    homeScore: fields.homeScore,
    awayScore: fields.awayScore,
    homePenaltyScore: fields.homePenaltyScore,
    awayPenaltyScore: fields.awayPenaltyScore,
    outcome: fields.outcome,
    notes: fields.notes,
    events: [...fields.events]
      .sort((a, b) => a.clientEventId.localeCompare(b.clientEventId))
      .map((event) => ({
        clientEventId: event.clientEventId,
        kind: event.kind,
        side: event.side,
        minute: event.minute,
        addedMinute: event.addedMinute,
        playerId: event.playerId,
        relatedPlayerId: event.relatedPlayerId,
      })),
  }
}

// Reads only the approved, frozen results.forfeit contract. There is no default ruling.
export function requireForfeitScore(fields: ReportFieldsDto, rules: unknown): void {
  if (fields.outcome !== 'HOME_FORFEIT' && fields.outcome !== 'AWAY_FORFEIT') return
  const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null
  const results = object(rules) ? rules.results : null
  const forfeit = object(results) ? results.forfeit : null
  if (
    !object(forfeit) ||
    !Number.isSafeInteger(forfeit.winnerGoals) ||
    !Number.isSafeInteger(forfeit.loserGoals) ||
    Number(forfeit.loserGoals) < 0 ||
    Number(forfeit.winnerGoals) > 99 ||
    Number(forfeit.winnerGoals) <= Number(forfeit.loserGoals)
  )
    throw new ReportRuleError('绑定规程尚未配置有效的弃权判罚，不能确认')
  const home =
    fields.outcome === 'HOME_FORFEIT' ? Number(forfeit.loserGoals) : Number(forfeit.winnerGoals)
  const away =
    fields.outcome === 'HOME_FORFEIT' ? Number(forfeit.winnerGoals) : Number(forfeit.loserGoals)
  if (Number(fields.homeScore) !== home || Number(fields.awayScore) !== away)
    throw new ReportRuleError(`规程判定比分应为 ${home} : ${away}，请退回核对后再确认`)
  if (fields.events.length) throw new ReportRuleError('弃权判定不计球员比赛事件，请退回核对')
}
