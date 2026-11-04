import type {
  TechnicalMetric,
  TechnicalOperation,
  TechnicalOutcome,
  TechnicalTotals,
} from './repository.weapp'
const metricRows: Array<{
  metric: TechnicalMetric
  label: string
  buttons: Array<{
    label: string
    outcome: TechnicalOutcome
    field: keyof TechnicalTotals
    tone?: string
  }>
}> = [
  {
    metric: 'PASS',
    label: '传球',
    buttons: [
      { label: '成功', outcome: 'SUCCESS', field: 'passSuccess' },
      { label: '失败', outcome: 'FAILURE', field: 'passFailure', tone: 'warm' },
    ],
  },
  {
    metric: 'TACKLE',
    label: '抢断',
    buttons: [
      { label: '成功', outcome: 'SUCCESS', field: 'tackleSuccess' },
      { label: '失败', outcome: 'FAILURE', field: 'tackleFailure', tone: 'warm' },
    ],
  },
  {
    metric: 'DRIBBLE',
    label: '过人',
    buttons: [
      { label: '成功', outcome: 'SUCCESS', field: 'dribbleSuccess' },
      { label: '失败', outcome: 'FAILURE', field: 'dribbleFailure', tone: 'warm' },
    ],
  },
  {
    metric: 'SHOT',
    label: '射门',
    buttons: [
      { label: '射正', outcome: 'ON_TARGET', field: 'shotsOnTarget' },
      { label: '射偏', outcome: 'OFF_TARGET', field: 'shotsOffTarget', tone: 'warm' },
      { label: '进球', outcome: 'GOAL', field: 'goals', tone: 'gold' },
    ],
  },
  {
    metric: 'FOUL',
    label: '犯规',
    buttons: [
      { label: '犯规', outcome: 'FOUL', field: 'fouls' },
      { label: '黄牌', outcome: 'YELLOW_CARD', field: 'yellowCards', tone: 'gold' },
      { label: '红牌', outcome: 'RED_CARD', field: 'redCards', tone: 'red' },
    ],
  },
  {
    metric: 'CHANCE',
    label: '绝佳机会',
    buttons: [
      { label: '创造', outcome: 'SUCCESS', field: 'chancesCreated' },
      { label: '错失', outcome: 'FAILURE', field: 'chancesMissed', tone: 'warm' },
    ],
  },
]
/** Top-to-bottom: high-frequency actions sit lowest, closest to the thumb. */
export const recordRows = ['FOUL', 'CHANCE', 'SHOT', 'DRIBBLE', 'TACKLE', 'PASS'].map(
  (metric) => metricRows.find((row) => row.metric === metric)!,
)
export type RecorderMode = 'full' | 'lite'
export const liteMetrics: readonly TechnicalMetric[] = ['FOUL', 'CHANCE', 'SHOT']
export function recorderRows(mode: RecorderMode) {
  return mode === 'lite' ? recordRows.filter((row) => liteMetrics.includes(row.metric)) : recordRows
}
export const recorderModeOf = (value: unknown): RecorderMode => (value === 'lite' ? 'lite' : 'full')
/** Toolbar, player strip, recent strip, footer and gaps. */
export const RECORDER_CHROME = 232
export function recorderGeometry(availableHeight: number, mode: RecorderMode = 'full') {
  const rows = recorderRows(mode).length,
    /* The board never scrolls: on small phones rows shrink towards these floors instead. */
    minimum = mode === 'lite' ? 56 : 36
  const rowHeight = Math.max(
    minimum,
    Math.floor((availableHeight - RECORDER_CHROME - (rows - 1) * 7) / rows),
  )
  return {
    rowHeight,
    height: Math.max(availableHeight, RECORDER_CHROME + rows * rowHeight + (rows - 1) * 7),
  }
}
export function recorderTeamState(
  teamIndex: number,
  selectedTeam: number,
  playerId: string | null,
) {
  return teamIndex !== selectedTeam ? 'idle' : playerId ? 'player' : 'team'
}
export function orderedRecorderPlayers<T extends { id: string }>(
  players: T[],
  saved: readonly string[],
) {
  const rank = new Map(saved.map((id, index) => [id, index]))
  return players
    .map((player, index) => ({ player, index }))
    .sort(
      (a, b) =>
        (rank.get(a.player.id) ?? saved.length + a.index) -
        (rank.get(b.player.id) ?? saved.length + b.index),
    )
    .map((item) => item.player)
}

export const ON_PITCH = 7
export type RecorderLineup = { pitch: string[]; bench: string[] }
type LineupPlayer = {
  id: string
  shirtNumber: string | null
  position?: string | null
  starter?: boolean | null
}
const shirt = (player: LineupPlayer) => {
  const value = Number.parseInt(player.shirtNumber || '', 10)
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}
function byShirt<T extends LineupPlayer>(players: readonly T[]) {
  return players
    .map((player, index) => ({ player, index }))
    .sort((a, b) => shirt(a.player) - shirt(b.player) || a.index - b.index)
    .map((item) => item.player)
}
/**
 * Confirmed starters without the goalkeeper (topped up / trimmed to seven by shirt
 * number); without a confirmed lineup, the seven lowest shirt numbers.
 */
export function defaultRecorderLineup(players: readonly LineupPlayer[]): RecorderLineup {
  const sorted = byShirt(players),
    confirmed = players.some((player) => player.starter === true)
  const preferred = confirmed
    ? sorted.filter((player) => player.starter === true && player.position !== 'GOALKEEPER')
    : []
  const pitch = [...preferred, ...sorted.filter((player) => !preferred.includes(player))]
    .slice(0, ON_PITCH)
    .map((player) => player.id)
  return { pitch, bench: sorted.map((player) => player.id).filter((id) => !pitch.includes(id)) }
}
/** Drops removed players, adds new ones to the bench and keeps seven on the pitch. */
export function resolveRecorderLineup(
  players: readonly LineupPlayer[],
  saved: unknown,
): RecorderLineup {
  const value = saved as Partial<RecorderLineup> | null
  if (!value || !Array.isArray(value.pitch) || !Array.isArray(value.bench))
    return defaultRecorderLineup(players)
  const known = new Set(players.map((player) => player.id)),
    seen = new Set<string>()
  const keep = (ids: unknown[]) =>
    ids.filter((id): id is string => {
      if (typeof id !== 'string' || !known.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
  const pitch = keep(value.pitch).slice(0, ON_PITCH),
    bench = [
      ...keep(value.bench),
      ...byShirt(players)
        .map((player) => player.id)
        .filter((id) => !seen.has(id) && !pitch.includes(id)),
    ]
  while (pitch.length < ON_PITCH && bench.length) pitch.push(bench.shift()!)
  return { pitch, bench }
}
/**
 * The sort dialog drags one flat list (场上 then 替补) with the shared drag-sort hook;
 * the zone boundary stays where it was, so dropping a bench player onto the pitch
 * pushes the last pitch player to the top of the bench and the pitch stays at seven.
 */
export function splitLineup(order: readonly string[], pitchCount: number): RecorderLineup {
  return { pitch: order.slice(0, pitchCount), bench: order.slice(pitchCount) }
}
/** Long-press substitution: the two players trade places. */
export function substitute(lineup: RecorderLineup, outgoing: string, incoming: string) {
  const from = lineup.pitch.indexOf(outgoing),
    to = lineup.bench.indexOf(incoming)
  if (from < 0 || to < 0) return lineup
  const next = { pitch: [...lineup.pitch], bench: [...lineup.bench] }
  next.pitch[from] = incoming
  next.bench[to] = outgoing
  return next
}
const outcomeText: Partial<Record<TechnicalMetric, Partial<Record<TechnicalOutcome, string>>>> = {
  PASS: { SUCCESS: '传球✓', FAILURE: '传球✗' },
  TACKLE: { SUCCESS: '抢断✓', FAILURE: '抢断✗' },
  DRIBBLE: { SUCCESS: '过人✓', FAILURE: '过人✗' },
  SHOT: { ATTEMPT: '射门', ON_TARGET: '射正', OFF_TARGET: '射偏', GOAL: '进球' },
  FOUL: { FOUL: '犯规', YELLOW_CARD: '黄牌', RED_CARD: '红牌' },
  CHANCE: { SUCCESS: '创造机会', FAILURE: '错失机会' },
}
/** The newest three still-active operations, newest first, as short labels. */
export function recentRecords(
  active: readonly TechnicalOperation[],
  teams: ReadonlyArray<{
    id: string
    shortName?: string
    name?: string
    players: ReadonlyArray<{ id: string; displayName: string; shirtNumber: string | null }>
  }>,
  limit = 3,
) {
  const who = (teamId: string, playerId: string | null) => {
    const team = teams.find((item) => item.id === teamId),
      player = team?.players.find((item) => item.id === playerId)
    return player
      ? `${player.shirtNumber ? player.shirtNumber + ' ' : ''}${player.displayName}`
      : `${team?.shortName || team?.name || '球队'} 全队`
  }
  return active
    .filter((operation) => operation.kind === 'COUNT' || operation.kind === 'SET_TOTALS')
    .slice(-limit)
    .reverse()
    .map((operation) => ({
      id: operation.id,
      text:
        operation.kind === 'COUNT'
          ? `${who(operation.teamId, operation.playerId)} · ${outcomeText[operation.metric]?.[operation.outcome] || operation.metric}`
          : operation.kind === 'SET_TOTALS'
            ? `${who(operation.teamId, operation.playerId)} · 汇总`
            : '',
    }))
}
