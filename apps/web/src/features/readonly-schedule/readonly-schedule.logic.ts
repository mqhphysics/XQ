import { leagueDate, leagueTime } from '../product/league-time.ts'
import type {
  MatchStatus,
  ReadonlyMatch,
  ReadonlyTeamSummary,
  ScheduleDateGroup,
  ScheduleFilters,
  ScheduleStageGroup,
} from './readonly-schedule.types'

export function sortMatchesByStartAt(matches: ReadonlyMatch[]): ReadonlyMatch[] {
  return [...matches].sort((left, right) => {
    const timeDiff = Date.parse(left.scheduledStartAt) - Date.parse(right.scheduledStartAt)
    if (timeDiff !== 0) return timeDiff
    return left.id.localeCompare(right.id)
  })
}

export function groupMatchesByDateAndStage(matches: ReadonlyMatch[]): ScheduleDateGroup[] {
  const sorted = sortMatchesByStartAt(matches)
  const groups: ScheduleDateGroup[] = []

  for (const match of sorted) {
    const dateKey = match.scheduledStartAt.slice(0, 10)
    let dateGroup = groups.find((group) => group.dateKey === dateKey)
    if (!dateGroup) {
      dateGroup = {
        dateKey,
        dateLabel: formatDateLabel(match.scheduledStartAt),
        stages: [],
      }
      groups.push(dateGroup)
    }

    let stageGroup: ScheduleStageGroup | undefined = dateGroup.stages.find(
      (group) => group.stageName === match.stageName,
    )
    if (!stageGroup) {
      stageGroup = { stageName: match.stageName, matches: [] }
      dateGroup.stages.push(stageGroup)
    }

    stageGroup.matches.push(match)
  }

  return groups
}

export function filterMatches(matches: ReadonlyMatch[], filters: ScheduleFilters): ReadonlyMatch[] {
  return sortMatchesByStartAt(matches).filter((match) => {
    const matchesDate = !filters.dateKey || match.scheduledStartAt.slice(0, 10) === filters.dateKey
    const matchesStage = !filters.stageName || match.stageName === filters.stageName
    return matchesDate && matchesStage
  })
}

export function getScheduleDateOptions(matches: ReadonlyMatch[]): string[] {
  return [
    ...new Set(sortMatchesByStartAt(matches).map((match) => match.scheduledStartAt.slice(0, 10))),
  ]
}

export function getScheduleStageOptions(matches: ReadonlyMatch[]): string[] {
  return [...new Set(sortMatchesByStartAt(matches).map((match) => match.stageName))]
}

export function filterTeams(teams: ReadonlyTeamSummary[], query: string): ReadonlyTeamSummary[] {
  const normalizedQuery = normalizeSearchText(query)
  const sorted = [...teams].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))

  if (!normalizedQuery) {
    return sorted
  }

  return sorted.filter((team) =>
    [team.name, team.shortName, team.teamCode].some((value) =>
      normalizeSearchText(value).includes(normalizedQuery),
    ),
  )
}

export function findFocusMatch(
  matches: ReadonlyMatch[],
  now: Date = new Date(),
): ReadonlyMatch | undefined {
  const sorted = sortMatchesByStartAt(matches)
  const live = sorted.find((match) => match.status === 'LIVE')
  if (live) {
    return live
  }

  const nowTime = now.getTime()
  return (
    sorted.find(
      (match) => match.status === 'SCHEDULED' && Date.parse(match.scheduledStartAt) >= nowTime,
    ) ?? sorted.find((match) => match.status === 'SCHEDULED')
  )
}

export function getMatchStatusText(status: MatchStatus): string {
  switch (status) {
    case 'DRAFT':
      return '草稿'
    case 'SCHEDULED':
      return '未开始'
    case 'LIVE':
      return '进行中'
    case 'POSTPONED':
      return '已延期'
    case 'CANCELLED':
      return '已取消'
    case 'FINISHED':
      return '已结束'
  }
}

export function getMatchStatusTone(status: MatchStatus): 'normal' | 'muted' | 'danger' | 'done' {
  switch (status) {
    case 'DRAFT':
      return 'muted'
    case 'LIVE':
      return 'normal'
    case 'POSTPONED':
      return 'muted'
    case 'CANCELLED':
      return 'danger'
    case 'FINISHED':
      return 'done'
    case 'SCHEDULED':
      return 'muted'
  }
}

export function formatMatchTime(value: string): string {
  return leagueTime(value)
}
export function formatDateLabel(value: string): string {
  const d = leagueDate(value)
  return d
    ? `${d.getUTCMonth() + 1}月${d.getUTCDate()}日周${'日一二三四五六'[d.getUTCDay()]}`
    : '时间待定'
}
export function formatCompactDate(value: string): string {
  const d = leagueDate(value)
  return d ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}` : '时间待定'
}

export function getRegistrationStatusText(status: string): string {
  switch (status) {
    case 'APPROVED':
      return '报名已通过'
    case 'SUBMITTED':
      return '报名审核中'
    case 'RETURNED':
      return '报名已退回'
    case 'WITHDRAWN':
      return '已退出赛事'
    case 'SUSPENDED':
      return '资格已暂停'
    case 'DRAFT':
      return '报名草稿'
    default:
      return status || '状态待确认'
  }
}

export function getRosterStatusText(status: string): string {
  switch (status) {
    case 'LOCKED':
      return '名单已锁定'
    case 'APPROVED':
      return '名单已通过'
    case 'SUBMITTED':
      return '名单审核中'
    case 'RETURNED':
      return '名单待修改'
    case 'REOPENED':
      return '名单已重开'
    case 'WITHDRAWN':
      return '名单已撤回'
    case 'DRAFT':
      return '名单草稿'
    default:
      return status || '名单待确认'
  }
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s_-]+/g, '')
}
