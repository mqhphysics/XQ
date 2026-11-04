import type { MatchExperienceResponse } from '../product/product.types'
import { orderedEvents, eventSide } from './lineup.logic.ts'
import { hasCompleteGoalTimeline, isGoalEventType } from './match-bulletin.logic.ts'

export type NativeMatchEvent = MatchExperienceResponse['events'][number]
export type NativeTimelineRow =
  | { kind: 'marker'; id: string; label: string }
  | {
      kind: 'event'
      id: string
      side: 'home' | 'away'
      events: NativeMatchEvent[]
      score: string | null
    }
export function nativeTimeline(match: MatchExperienceResponse): NativeTimelineRow[] {
  const rows: NativeTimelineRow[] = [{ kind: 'marker', id: 'start', label: '比赛开始' }]
  let home = 0,
    away = 0,
    half = false
  const halfMinutes = match.periodMinutes ?? 45
  const completeGoals = hasCompleteGoalTimeline(match)
  for (const event of orderedEvents(match.events)) {
    if (!half && event.minute > halfMinutes) {
      rows.push({
        kind: 'marker',
        id: 'half',
        label: completeGoals ? `半场 ${home} : ${away}` : '中场 · 事件待补',
      })
      half = true
    }
    const side = eventSide(event, match.homeTeam?.id)
    const previous = rows[rows.length - 1]
    if (
      event.type === 'SUBSTITUTION' &&
      previous?.kind === 'event' &&
      previous.side === side &&
      previous.events[0]?.type === 'SUBSTITUTION' &&
      previous.events[0].minute === event.minute &&
      previous.events[0].stoppageMinute === event.stoppageMinute
    ) {
      previous.events.push(event)
      continue
    }
    const goal = isGoalEventType(event.type)
    if (goal) {
      const forHome = event.type === 'OWN_GOAL' ? side === 'away' : side === 'home'
      if (forHome) home++
      else away++
    }
    rows.push({
      kind: 'event',
      id: event.id,
      side,
      events: [event],
      score: goal && completeGoals ? `${home} : ${away}` : null,
    })
  }
  if (['FINISHED', 'CONFIRMED'].includes(match.status)) {
    if (!half)
      rows.push({
        kind: 'marker',
        id: 'half',
        label: completeGoals ? `半场 ${home} : ${away}` : '中场 · 事件待补',
      })
    rows.push({
      kind: 'marker',
      id: 'full',
      label: `全场 ${match.homeScore ?? home} : ${match.awayScore ?? away}`,
    })
  }
  return rows
}
