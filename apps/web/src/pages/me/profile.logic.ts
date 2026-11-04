import type { AuthUser, MatchSummary } from '../../features/product/product.types'

export interface ProfileLibrary {
  version: 1
  followedMatchIds: string[]
  bookmarkedPostIds: string[]
  reminderMatchIds: string[]
}
export function emptyLibrary(): ProfileLibrary {
  return { version: 1, followedMatchIds: [], bookmarkedPostIds: [], reminderMatchIds: [] }
}
export function libraryKey(user: Pick<AuthUser, 'id' | 'organizationId'>): string {
  return `xiaoqiu.profile-library.v1:${user.organizationId}:${user.id}`
}
export function parseLibrary(raw: string | null): ProfileLibrary {
  if (!raw) return emptyLibrary()
  const value = JSON.parse(raw) as ProfileLibrary
  if (value.version !== 1) throw new Error('不支持的本机收藏版本')
  const ids = (items: unknown): string[] => {
    if (!Array.isArray(items) || items.some((id) => typeof id !== 'string'))
      throw new Error('本机收藏记录损坏')
    return [...new Set(items)]
  }
  return {
    version: 1,
    followedMatchIds: ids(value.followedMatchIds),
    bookmarkedPostIds: ids(value.bookmarkedPostIds),
    reminderMatchIds: ids(value.reminderMatchIds),
  }
}
export function managedTeamIds(user: AuthUser, availableIds: string[]): string[] {
  const organizationAdmin = user.roles.some(
    (role) =>
      role.role === 'PLATFORM_ADMIN' ||
      (role.role === 'ORGANIZATION_ADMIN' &&
        role.scopeType === 'ORGANIZATION' &&
        role.scopeId === user.organizationId),
  )
  if (organizationAdmin) return availableIds
  return [
    ...new Set(
      user.roles
        .filter(
          (role) =>
            (role.role === 'TEAM_CAPTAIN' || role.role === 'TEAM_COACH') &&
            role.scopeType === 'TEAM',
        )
        .map((role) => role.scopeId),
    ),
  ]
}
export function isPendingMatch(match: MatchSummary): boolean {
  return ['SCHEDULED', 'CHECK_IN', 'LIVE', 'POSTPONED'].includes(match.status)
}
export function canRemind(match: MatchSummary, now = Date.now()): boolean {
  return (
    ['SCHEDULED', 'CHECK_IN'].includes(match.status) &&
    Boolean(match.scheduledStartAt && new Date(match.scheduledStartAt).getTime() > now)
  )
}
export function calendarEvent(match: MatchSummary, now = Date.now()): string {
  if (!canRemind(match, now)) throw new Error('比赛时间待定、已过或状态不支持提醒')
  const escape = (value: string) =>
    value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
  const date = (value: number) =>
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')
  const start = new Date(match.scheduledStartAt!).getTime()
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Xiaoqiu//Match reminder//ZH',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${match.id}@xiaoqiu.local`,
    `DTSTAMP:${date(now)}`,
    `DTSTART:${date(start)}`,
    `DTEND:${date(start + 2 * 60 * 60 * 1000)}`,
    `SUMMARY:${escape(`${match.homeTeam?.name ?? '主队待定'} vs ${match.awayTeam?.name ?? '客队待定'}`)}`,
    `LOCATION:${escape(match.venue?.name ?? '场地待定')}`,
    `DESCRIPTION:${escape(match.title + '；预计时长两小时，以正式赛程为准。')}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:晓球比赛将在15分钟后开始',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}
