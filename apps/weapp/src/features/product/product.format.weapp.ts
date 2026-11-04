export {
  matchStatusLabel,
  matchStatusTone,
  positionLabel,
  footLabel,
  verificationLabel,
  roleLabel,
  eventLabel,
} from './product-format.shared.ts'
export const MATCH_TIME_ZONE = 'Asia/Shanghai'
import { leagueDate as parts, leagueShortDate, leagueTime } from './league-time.ts'
export function formatDate(value: string | null) {
  return leagueShortDate(value)
}
export function formatLongDate(value: string | null) {
  const d = parts(value)
  return d
    ? `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 周${'日一二三四五六'[d.getUTCDay()]}`
    : '时间待定'
}
export function formatTime(value: string | null) {
  return leagueTime(value)
}
export function formatRelativeTime(value: string) {
  const time = Date.parse(value),
    diff = Date.now() - time
  if (!Number.isFinite(time)) return ''
  if (diff >= 0 && diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`
  if (diff >= 0 && diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return formatDate(value).split('周')[0]!
}
