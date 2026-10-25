import type { HomeResponse, MatchSummary } from '../../features/product/product.types'
import { formatDate, formatTime } from '../../features/product/product.format.weapp.ts'
export function nativeFocusValue(match: MatchSummary) {
  return match.homeScore !== null && match.awayScore !== null
    ? `${match.homeScore} : ${match.awayScore}`
    : match.scheduledStartAt
      ? `${formatDate(match.scheduledStartAt).split('周')[0]}\n${formatTime(match.scheduledStartAt)}`
      : '待定'
}
export function nativeFocusLabel(match: MatchSummary, tournamentName: string) {
  const round = (/第.*轮/.test(match.title) ? match.title : match.roundName || match.title).replace(
    /^(半决赛|决赛|八强赛|季军赛)\s*\d+$/,
    '$1',
  )
  return `${tournamentName} · ${round}`
}
export function nativeAnnouncements(home: HomeResponse) {
  const unique = new Map(
    [...home.announcements, ...(home.platformAnnouncements || [])].map((post) => [post.id, post]),
  )
  return [...unique.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}
export function nativeFocusMatches(matches: MatchSummary[]) {
  const time = (match: MatchSummary) =>
    match.scheduledStartAt ? Date.parse(match.scheduledStartAt) : Number.MAX_SAFE_INTEGER
  const live = matches.filter((match) => match.status === 'LIVE').sort((a, b) => time(a) - time(b))
  const finished = matches
    .filter((match) => ['FINISHED', 'CONFIRMED'].includes(match.status))
    .sort(
      (a, b) =>
        (b.scheduledStartAt ? Date.parse(b.scheduledStartAt) : 0) -
        (a.scheduledStartAt ? Date.parse(a.scheduledStartAt) : 0),
    )
  const upcoming = matches
    .filter(
      (match) =>
        !['LIVE', 'FINISHED', 'CONFIRMED', 'CANCELLED', 'ABANDONED'].includes(match.status),
    )
    .sort((a, b) => time(a) - time(b))
  const selected = [...live, ...finished.slice(0, 1), ...upcoming, ...finished.slice(1)].slice(0, 2)
  return selected.length ? selected : matches.slice(0, 2)
}
