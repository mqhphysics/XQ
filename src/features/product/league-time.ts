/** League calendar is UTC+8; avoid optional locale support in Android WeChat. */
export function leagueDate(value: string | null) {
  if (!value) return null
  let iso = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T')
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso += 'T00:00:00+08:00'
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(iso)) iso += '+08:00'
  const time = Date.parse(iso)
  return Number.isFinite(time) ? new Date(time + 8 * 3600000) : null
}
const pad = (n: number) => String(n).padStart(2, '0')
export function leagueDay(value: string | null) {
  const d = leagueDate(value)
  return d ? `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}` : '时间待定'
}
export function leagueTime(value: string | null) {
  const d = leagueDate(value)
  return d ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : '--:--'
}
export function leagueShortDate(value: string | null) {
  const d = leagueDate(value)
  return d ? `${leagueDay(value)}周${'日一二三四五六'[d.getUTCDay()]}` : '时间待定'
}
