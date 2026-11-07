export const TECHNICAL_METRICS = [
  'PASS',
  'TACKLE',
  'DRIBBLE',
  'SHOT',
  'FOUL',
  'CHANCE',
  'CORNER',
] as const
export type TechnicalMetric = (typeof TECHNICAL_METRICS)[number]
export const TECHNICAL_TOTAL_KEYS = [
  'passSuccess',
  'passFailure',
  'tackleSuccess',
  'tackleFailure',
  'dribbleSuccess',
  'dribbleFailure',
  'shotsOnTarget',
  'shotsOffTarget',
  'goals',
  'unclassifiedShots',
  'fouls',
  'yellowCards',
  'redCards',
  'chancesCreated',
  'chancesMissed',
  'corners',
] as const
export type TechnicalTotals = Record<(typeof TECHNICAL_TOTAL_KEYS)[number], number>
export type TechnicalOutcome =
  | 'SUCCESS'
  | 'FAILURE'
  | 'ATTEMPT'
  | 'ON_TARGET'
  | 'OFF_TARGET'
  | 'GOAL'
  | 'FOUL'
  | 'YELLOW_CARD'
  | 'RED_CARD'
export type TechnicalOperation = { id: string; occurredAt: string } & (
  | {
      kind: 'COUNT'
      teamId: string
      playerId: string | null
      metric: TechnicalMetric
      outcome: TechnicalOutcome
    }
  | { kind: 'GOAL'; shotId: string }
  | { kind: 'UNDO'; targetId: string }
  | {
      kind: 'SET_TOTALS'
      teamId: string
      playerId: string | null
      totals: TechnicalTotals
      reason?: string
    }
)
export type TechnicalCount = Extract<TechnicalOperation, { kind: 'COUNT' }>
type Active = Exclude<TechnicalOperation, { kind: 'UNDO' }>
type Bucket = { teamId: string; playerId: string | null; totals: TechnicalTotals }
export const emptyTechnicalTotals = (): TechnicalTotals => {
  const totals = {} as TechnicalTotals
  for (const key of TECHNICAL_TOTAL_KEYS) totals[key] = 0
  return totals
}
const scope = (teamId: string, playerId: string | null) => teamId + ':' + (playerId || 'team')
function aggregate(buckets: Map<string, Bucket>, teamId: string, playerId?: string | null) {
  const result = emptyTechnicalTotals()
  for (const bucket of buckets.values())
    if (bucket.teamId === teamId && (!playerId || bucket.playerId === playerId))
      for (const key of TECHNICAL_TOTAL_KEYS) result[key] += bucket.totals[key]
  return result
}
function validateTotals(totals: TechnicalTotals) {
  for (const key of TECHNICAL_TOTAL_KEYS)
    if (!Number.isSafeInteger(totals[key]) || totals[key] < 0 || totals[key] > 100000)
      throw Error('汇总数量应为0—100000的整数')
  if (totals.goals > totals.shotsOnTarget) throw Error('进球计入射正，进球数不能多于射正数')
}
function fold(active: Active[]) {
  const buckets = new Map<string, Bucket>(),
    counts: TechnicalCount[] = [],
    goals = new Set<string>(),
    explicitTeams = new Set<string>()
  const bucket = (teamId: string, playerId: string | null) => {
    const key = scope(teamId, playerId)
    if (!buckets.has(key)) buckets.set(key, { teamId, playerId, totals: emptyTechnicalTotals() })
    return buckets.get(key)!.totals
  }
  for (const op of active) {
    if (op.kind === 'SET_TOTALS') {
      validateTotals(op.totals)
      const previous = aggregate(buckets, op.teamId, op.playerId)
      const previousTeam = aggregate(buckets, op.teamId)
      if (
        TECHNICAL_TOTAL_KEYS.some((key) => op.totals[key] < previous[key]) &&
        (op.reason?.trim().length || 0) < 2
      )
        throw Error('减少已记录数量时，请填写简短的修改说明')
      const next = { ...op.totals }
      if (!op.playerId)
        for (const b of buckets.values())
          if (b.teamId === op.teamId && b.playerId)
            for (const key of TECHNICAL_TOTAL_KEYS) next[key] -= b.totals[key]
      if (TECHNICAL_TOTAL_KEYS.some((key) => next[key] < 0))
        throw Error('球队合计不能少于已记录的球员合计，请先调整球员数据')
      // Residual team figures must remain valid even when named player results are present.
      validateTotals(next)
      buckets.set(scope(op.teamId, op.playerId), {
        teamId: op.teamId,
        playerId: op.playerId,
        totals: next,
      })
      if (!op.playerId) explicitTeams.add(op.teamId)
      else if (explicitTeams.has(op.teamId)) {
        const residual = { ...previousTeam }
        for (const named of buckets.values())
          if (named.teamId === op.teamId && named.playerId)
            for (const key of TECHNICAL_TOTAL_KEYS) residual[key] -= named.totals[key]
        if (TECHNICAL_TOTAL_KEYS.some((key) => residual[key] < 0))
          throw Error('球员合计超过了已填的球队汇总，请先更新球队合计')
        validateTotals(residual)
        buckets.set(scope(op.teamId, null), { teamId: op.teamId, playerId: null, totals: residual })
      }
      for (let i = counts.length - 1; i >= 0; i--)
        if (counts[i]!.teamId === op.teamId && counts[i]!.playerId === op.playerId) {
          goals.delete(counts[i]!.id)
          counts.splice(i, 1)
        }
    } else if (op.kind === 'GOAL') {
      const shot = counts.find((x) => x.id === op.shotId && x.metric === 'SHOT')
      if (!shot || goals.has(shot.id) || shot.outcome === 'OFF_TARGET')
        throw Error('请先记录这次射门，不能重复或矛盾标记进球')
      const totals = bucket(shot.teamId, shot.playerId)
      if (shot.outcome === 'ATTEMPT') {
        totals.unclassifiedShots--
        totals.shotsOnTarget++
      }
      totals.goals++
      goals.add(shot.id)
    } else {
      const totals = bucket(op.teamId, op.playerId)
      counts.push(op)
      if (op.metric === 'SHOT') {
        if (op.outcome === 'ATTEMPT') totals.unclassifiedShots++
        else if (op.outcome === 'OFF_TARGET') totals.shotsOffTarget++
        else {
          totals.shotsOnTarget++
          if (op.outcome === 'GOAL') {
            totals.goals++
            goals.add(op.id)
          }
        }
      } else if (op.metric === 'FOUL')
        totals[
          op.outcome === 'YELLOW_CARD'
            ? 'yellowCards'
            : op.outcome === 'RED_CARD'
              ? 'redCards'
              : 'fouls'
        ]++
      else if (op.metric === 'CORNER') totals.corners++
      else if (op.metric === 'CHANCE')
        totals[op.outcome === 'SUCCESS' ? 'chancesCreated' : 'chancesMissed']++
      else {
        const prefix = op.metric === 'PASS' ? 'pass' : op.metric === 'TACKLE' ? 'tackle' : 'dribble'
        const key = (prefix +
          (op.outcome === 'SUCCESS' ? 'Success' : 'Failure')) as keyof TechnicalTotals
        totals[key]++
      }
    }
  }
  for (const b of buckets.values()) validateTotals(b.totals)
  return { buckets, counts, goals }
}
export function technicalState(operations: readonly TechnicalOperation[]) {
  const active: Active[] = [],
    ids = new Set<string>()
  for (const op of operations) {
    if (!op.id || ids.has(op.id)) throw Error('统计操作编号重复')
    ids.add(op.id)
    if (op.kind === 'UNDO') {
      if (!active.length || active[active.length - 1]!.id !== op.targetId)
        throw Error('只能撤销最近一次操作，请先刷新记录')
      active.pop()
    } else if (op.kind === 'COUNT') {
      const allowed =
        op.metric === 'SHOT'
          ? ['ATTEMPT', 'ON_TARGET', 'OFF_TARGET', 'GOAL']
          : op.metric === 'FOUL'
            ? ['FOUL', 'YELLOW_CARD', 'RED_CARD']
            : op.metric === 'CORNER'
              ? ['SUCCESS']
              : ['SUCCESS', 'FAILURE']
      if (!TECHNICAL_METRICS.includes(op.metric) || !allowed.includes(op.outcome))
        throw Error('统计项目和结果不匹配')
      if (op.metric === 'CORNER' && op.playerId) throw Error('角球按球队记录，请选择全队')
      active.push(op)
    } else if (op.kind === 'GOAL') {
      const state = fold(active),
        shot = state.counts.find((x) => x.id === op.shotId && x.metric === 'SHOT')
      if (!shot || state.goals.has(shot.id)) throw Error('请先记录这次射门，不能重复标记进球')
      active.push(op)
    } else {
      const normalized = { ...op, totals: { ...op.totals, corners: op.totals.corners ?? 0 } }
      if (op.playerId && normalized.totals.corners) throw Error('角球按球队记录，请选择全队')
      validateTotals(normalized.totals)
      active.push(normalized)
      fold(active)
    }
  }
  return { ...fold(active), active, undoTarget: active[active.length - 1]?.id || null }
}
export function technicalTotals(
  operations: readonly TechnicalOperation[],
  teamId: string,
  playerId?: string | null,
) {
  return aggregate(technicalState(operations).buckets, teamId, playerId)
}
export function technicalSummary(
  operations: readonly TechnicalOperation[],
  teamId: string,
  playerId?: string | null,
) {
  const totals = technicalTotals(operations, teamId, playerId)
  return TECHNICAL_METRICS.map((metric) => {
    const success =
      metric === 'PASS'
        ? totals.passSuccess
        : metric === 'TACKLE'
          ? totals.tackleSuccess
          : metric === 'DRIBBLE'
            ? totals.dribbleSuccess
            : metric === 'CHANCE'
              ? totals.chancesCreated
              : metric === 'SHOT'
                ? totals.shotsOnTarget
                : metric === 'CORNER'
                  ? totals.corners
                  : totals.fouls
    const failure =
      metric === 'PASS'
        ? totals.passFailure
        : metric === 'TACKLE'
          ? totals.tackleFailure
          : metric === 'DRIBBLE'
            ? totals.dribbleFailure
            : metric === 'CHANCE'
              ? totals.chancesMissed
              : metric === 'SHOT'
                ? totals.shotsOffTarget
                : 0
    return {
      metric,
      total: success + failure + (metric === 'SHOT' ? totals.unclassifiedShots : 0),
      success,
      failure,
      goals: metric === 'SHOT' ? totals.goals : 0,
      yellowCards: metric === 'FOUL' ? totals.yellowCards : 0,
      redCards: metric === 'FOUL' ? totals.redCards : 0,
    }
  })
}
export function technicalV2Required(operations: readonly TechnicalOperation[]) {
  return operations.some(
    (op) =>
      op.kind === 'SET_TOTALS' ||
      (op.kind === 'COUNT' &&
        (!['PASS', 'TACKLE', 'DRIBBLE', 'SHOT'].includes(op.metric) ||
          !['SUCCESS', 'FAILURE', 'ATTEMPT'].includes(op.outcome))),
  )
}

export function technicalV3Required(operations: readonly TechnicalOperation[]) {
  return operations.some(
    (op) =>
      (op.kind === 'COUNT' && op.metric === 'CORNER') ||
      (op.kind === 'SET_TOTALS' && (op.totals.corners ?? 0) > 0),
  )
}
