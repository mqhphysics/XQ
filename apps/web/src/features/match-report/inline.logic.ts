import type { MatchExperienceResponse } from '../product/product.types.ts'
import { cloneFields, emptyFields, goalCounts } from './logic.ts'
import type { EventKind, ReportEvent, ReportFields, ReportWorkspace, Side } from './types.ts'

export function initialInlineFields(
  match: MatchExperienceResponse,
  workspace: ReportWorkspace,
): ReportFields {
  if (workspace.latest) {
    const stored = cloneFields(workspace.latest.fields)
    return changeInlineScore(
      changeInlineScore(stored, 'HOME', stored.homeScore, () => crypto.randomUUID()),
      'AWAY',
      stored.awayScore,
      () => crypto.randomUUID(),
    )
  }
  const fields = emptyFields()
  fields.homeScore = String(match.homeScore ?? 0)
  fields.awayScore = String(match.awayScore ?? 0)
  fields.homePenaltyScore = match.homePenaltyScore === null ? '' : String(match.homePenaltyScore)
  fields.awayPenaltyScore = match.awayPenaltyScore === null ? '' : String(match.awayPenaltyScore)
  fields.events = match.events
    .filter((event) =>
      ['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION'].includes(event.type),
    )
    .map((event) => ({
      id: event.id,
      kind: event.type as EventKind,
      side: event.team.id === match.homeTeam?.id ? 'HOME' : 'AWAY',
      minute: String(event.minute),
      addedMinute: event.stoppageMinute === null ? '' : String(event.stoppageMinute),
      playerId: event.player?.id ?? '',
      relatedPlayerId: event.relatedPlayer?.id ?? '',
    }))
  return changeInlineScore(
    changeInlineScore(fields, 'HOME', fields.homeScore, () => crypto.randomUUID()),
    'AWAY',
    fields.awayScore,
    () => crypto.randomUUID(),
  )
}

export function scoringSide(event: ReportEvent): Side {
  return event.kind === 'OWN_GOAL' ? (event.side === 'HOME' ? 'AWAY' : 'HOME') : event.side
}

export function resizeEventRows(
  fields: ReportFields,
  kind: EventKind,
  side: Side,
  count: number,
  id: () => string,
): ReportFields {
  if (!Number.isInteger(count) || count < 0 || count > 99) return fields
  const belongs = (event: ReportEvent) =>
    kind === 'GOAL'
      ? (event.kind === 'GOAL' || event.kind === 'OWN_GOAL') && scoringSide(event) === side
      : event.kind === kind && event.side === side
  const rows = fields.events.filter(belongs)
  const remove = new Set(
    rows
      .filter((row) => !row.minute || !row.playerId)
      .concat(rows.filter((row) => row.minute && row.playerId).reverse())
      .slice(0, Math.max(0, rows.length - count))
      .map((row) => row.id),
  )
  const events = fields.events.filter((event) => !remove.has(event.id))
  for (let index = rows.length; index < count; index++)
    events.push({
      id: id(),
      kind,
      side,
      minute: '',
      addedMinute: '',
      playerId: '',
      relatedPlayerId: '',
    })
  return { ...fields, events }
}

export function changeInlineScore(
  fields: ReportFields,
  side: Side,
  value: string,
  id: () => string,
) {
  const next = { ...fields, [side === 'HOME' ? 'homeScore' : 'awayScore']: value }
  return /^\d{1,2}$/.test(value) ? resizeEventRows(next, 'GOAL', side, Number(value), id) : next
}

export function inlineEventCount(fields: ReportFields, kind: EventKind, side: Side) {
  return fields.events.filter((event) => event.kind === kind && event.side === side).length
}

export function orderedReportEvents(events: ReportEvent[]) {
  return [...events].sort(
    (a, b) =>
      (a.minute === '' ? Infinity : Number(a.minute)) -
        (b.minute === '' ? Infinity : Number(b.minute)) ||
      Number(a.addedMinute) - Number(b.addedMinute),
  )
}

export type EventClock = Pick<ReportEvent, 'minute' | 'addedMinute'>
export function eventsByConfirmedClock(events: ReportEvent[], clocks: Record<string, EventClock>) {
  const value = (event: ReportEvent) =>
    clocks[event.id]?.minute ? Number(clocks[event.id]!.minute) : Infinity
  return [...events].sort(
    (a, b) =>
      value(a) - value(b) ||
      Number(clocks[a.id]?.addedMinute || 0) - Number(clocks[b.id]?.addedMinute || 0),
  )
}
export function eventReady(event: ReportEvent, workspace: ReportWorkspace) {
  const players = event.side === 'HOME' ? workspace.homeTeam.players : workspace.awayTeam.players
  return (
    /^\d{1,3}$/.test(event.minute) &&
    Number(event.minute) <= 120 &&
    (event.addedMinute === '' ||
      (/^\d{1,2}$/.test(event.addedMinute) && Number(event.addedMinute) <= 30)) &&
    players.some((player) => player.id === event.playerId) &&
    (event.relatedPlayerId === '' ||
      (event.relatedPlayerId !== event.playerId &&
        players.some((player) => player.id === event.relatedPlayerId))) &&
    (event.kind !== 'SUBSTITUTION' || event.relatedPlayerId !== '')
  )
}

export function draftWithScores(fields: ReportFields): ReportFields {
  const counts = goalCounts(fields)
  return {
    ...fields,
    homeScore: fields.homeScore || String(counts.HOME),
    awayScore: fields.awayScore || String(counts.AWAY),
  }
}
