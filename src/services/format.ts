import type { MatchSummary } from '../types'

const DATE_PARSE_CACHE_LIMIT = 400
const parsedDatePartCache = new Map<
  string,
  { year: number; month: number; day: number; hour: number; minute: number; weekday: number }
>()

export function formatMatchStatus(status: MatchSummary['status']): string {
  switch (status) {
    case 'live':
      return '进行中'
    case 'finished':
      return '已结束'
    case 'postponed':
      return '延期'
    case 'cancelled':
      return '取消'
    default:
      return '即将开始'
  }
}

export function formatPosition(position: string): string {
  switch (position) {
    case 'GK':
      return '门将'
    case 'DF':
      return '后卫'
    case 'MF':
      return '中场'
    case 'FW':
      return '前锋'
    default:
      return position
  }
}

export function formatTeamRole(role: string): string {
  switch (role) {
    case 'captain':
      return '队长'
    case 'coach':
      return '教练'
    case 'manager':
      return '领队'
    default:
      return '队员'
  }
}

export function formatEventLabel(eventType: string): string {
  switch (eventType) {
    case 'goal':
      return '进球'
    case 'penalty_goal':
      return '点球命中'
    case 'own_goal':
      return '乌龙球'
    case 'yellow_card':
      return '黄牌'
    case 'red_card':
      return '红牌'
    case 'substitution':
      return '换人'
    case 'note':
      return '备注'
    default:
      return eventType
  }
}

export function formatDateTime(value: string): string {
  const parts = parseDateParts(value)
  if (!parts) return value
  return `${pad2(parts.month)}月${pad2(parts.day)}日 ${pad2(parts.hour)}:${pad2(parts.minute)}`
}

export function formatShortDate(value: string): string {
  const parts = parseDateParts(value)
  if (!parts) return value
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${pad2(parts.month)}/${pad2(parts.day)} ${weekdays[parts.weekday]}`
}

export function formatKickoffTime(value: string): string {
  const parts = parseDateParts(value)
  if (!parts) return value
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`
}

export function formatDateKey(value: string): string {
  const parts = parseDateParts(value)
  if (!parts) return value.slice(0, 10)
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

function parseDateParts(value: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
} | null {
  const cached = parsedDatePartCache.get(value)
  if (cached) return cached

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?/,
  )
  let result: {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    weekday: number
  } | null = null

  if (match) {
    const [, yearText, monthText, dayText, hourText = '00', minuteText = '00', zoneText] = match
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const hour = Number(hourText)
    const minute = Number(minuteText)

    if (zoneText) {
      const offsetMinutes = parseTimeZoneOffset(zoneText)
      const utcTimestamp =
        Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60_000 + 8 * 3_600_000
      const beijingDate = new Date(utcTimestamp)
      result = {
        year: beijingDate.getUTCFullYear(),
        month: beijingDate.getUTCMonth() + 1,
        day: beijingDate.getUTCDate(),
        hour: beijingDate.getUTCHours(),
        minute: beijingDate.getUTCMinutes(),
        weekday: beijingDate.getUTCDay(),
      }
    } else {
      const date = new Date(Date.UTC(year, month - 1, day, hour, minute))
      if (!Number.isNaN(date.getTime())) {
        result = {
          year,
          month,
          day,
          hour,
          minute,
          weekday: date.getUTCDay(),
        }
      }
    }
  } else {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      const beijingDate = new Date(date.getTime() + 8 * 3_600_000)
      result = {
        year: beijingDate.getUTCFullYear(),
        month: beijingDate.getUTCMonth() + 1,
        day: beijingDate.getUTCDate(),
        hour: beijingDate.getUTCHours(),
        minute: beijingDate.getUTCMinutes(),
        weekday: beijingDate.getUTCDay(),
      }
    }
  }

  if (result) {
    if (parsedDatePartCache.size >= DATE_PARSE_CACHE_LIMIT) {
      const oldestKey = parsedDatePartCache.keys().next().value
      if (oldestKey !== undefined) parsedDatePartCache.delete(oldestKey)
    }
    parsedDatePartCache.set(value, result)
  }
  return result
}

function parseTimeZoneOffset(value: string): number {
  if (value === 'Z') return 0
  const sign = value.startsWith('-') ? -1 : 1
  const clean = value.slice(1).replace(':', '')
  const hours = Number(clean.slice(0, 2))
  const minutes = Number(clean.slice(2, 4) || '0')
  return sign * (hours * 60 + minutes)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}