import type { MatchSummary } from '../../features/product/product.types'
export interface NativeScheduleFilter {
  date: string
  team: string
  stage: string
  status: 'all' | 'upcoming' | 'live' | 'finished'
  primaryOnly: boolean
  descending: boolean
}
export const emptyScheduleFilter: NativeScheduleFilter = {
  date: '',
  team: '',
  stage: '',
  status: 'all',
  primaryOnly: false,
  descending: false,
}
export function nativeMatchDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'TBD'
  return new Date(Date.parse(value) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
export function nativeMatchStage(match: MatchSummary) {
  return (
    match.stageName || match.stageType || (match.roundName?.includes('小组') ? '小组赛' : '淘汰赛')
  )
}
export function filterNativeSchedule(
  matches: MatchSummary[],
  filter: NativeScheduleFilter,
  primaryId?: string | null,
) {
  return matches
    .filter((match) => {
      if (filter.date && nativeMatchDate(match.scheduledStartAt) !== filter.date) return false
      const teams = [match.homeTeam?.id, match.awayTeam?.id]
      if (filter.team && !teams.includes(filter.team)) return false
      if (filter.primaryOnly && (!primaryId || !teams.includes(primaryId))) return false
      if (filter.stage && nativeMatchStage(match) !== filter.stage) return false
      if (filter.status === 'finished' && !['FINISHED', 'CONFIRMED'].includes(match.status))
        return false
      if (filter.status === 'live' && match.status !== 'LIVE') return false
      if (
        filter.status === 'upcoming' &&
        !['SCHEDULED', 'CHECK_IN', 'POSTPONED'].includes(match.status)
      )
        return false
      return true
    })
    .sort((a, b) => {
      if (!a.scheduledStartAt) return b.scheduledStartAt ? 1 : 0
      if (!b.scheduledStartAt) return -1
      return (
        (Date.parse(a.scheduledStartAt) - Date.parse(b.scheduledStartAt)) *
        (filter.descending ? -1 : 1)
      )
    })
}
