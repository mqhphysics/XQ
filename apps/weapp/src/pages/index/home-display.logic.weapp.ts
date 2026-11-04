import type { HomeResponse, MatchSummary } from '../../features/product/product.types'
import type { Catalog } from '../../features/campus/campus.repository.h5'
import { formatDate, formatTime } from '../../features/product/product.format.weapp.ts'
export type NativeFocusMatch = MatchSummary & { focusGender?: string; focusCupName?: string }
const ended = (m: MatchSummary) => ['FINISHED', 'CONFIRMED'].includes(m.status)
const scored = (m: MatchSummary) => m.homeScore !== null && m.awayScore !== null
const time = (m: MatchSummary) =>
  m.scheduledStartAt && Number.isFinite(Date.parse(m.scheduledStartAt))
    ? Date.parse(m.scheduledStartAt)
    : 0
const gender = (value: string) =>
  /WOMEN|FEMALE|女/i.test(value) ? 'WOMEN' : /MEN|MALE|男/i.test(value) ? 'MEN' : ''
const final = (m: MatchSummary) => {
  const round = `${m.roundName || ''} ${m.title || ''} ${m.stageName || ''}`
  return (
    /决赛|\bfinal\b/i.test(round) &&
    !/半决赛|季军|三四|四分之一|八强|十六强|1\/[248]|semi|quarter/i.test(round)
  )
}
export function nativeFocusValue(match: MatchSummary) {
  return scored(match)
    ? `${match.homeScore} : ${match.awayScore}`
    : ended(match)
      ? '待补比分'
      : match.scheduledStartAt
        ? `${formatDate(match.scheduledStartAt).split('周')[0]}\n${formatTime(match.scheduledStartAt)}`
        : '待定'
}
function nativeFocusRound(match: NativeFocusMatch) {
  const source = `${match.roundName || ''} ${match.title || ''} ${match.stageName || ''}`
  if (/半决赛|二分之一|1\/2|semi/i.test(source)) return '半决赛'
  if (/四分之一|1\/4|八强|quarter/i.test(source)) return '八强赛'
  if (/十六强|1\/8/i.test(source)) return '十六强赛'
  if (/季军|三四名/i.test(source)) return '季军赛'
  if (final(match))
    return `${gender(match.focusGender || '') === 'MEN' ? '男足' : gender(match.focusGender || '') === 'WOMEN' ? '女足' : ''}决赛`
  const round = source.match(/第\s*(\d+|[一二三四五六七八九十]+)\s*轮/)?.[1]
  const group = (
    match.groupName ||
    match.homeTeam?.groupName ||
    source.match(/小组(?:赛)?\s*([A-Z])(?:组)?/i)?.[1] ||
    ''
  )
    .replace(/^(?:小组|group)\s*/i, '')
    .replace(/组$/, '')
    .trim()
  if (group || /小组|group/i.test(source)) return `小组${group}${round ? `第${round}轮` : ''}`
  if (round) return `第${round}轮`
  return '比赛'
}
export function nativeFocusLabel(match: NativeFocusMatch, tournamentName = '') {
  const round = nativeFocusRound(match)
    .replace(/^(?:男足|女足)(?=决赛$)/, '')
    .replace(/^小组([A-Z])/, '$1组')
  const type = gender(match.focusGender || tournamentName || match.title)
  return `${type === 'MEN' ? '男足 · ' : type === 'WOMEN' ? '女足 · ' : ''}${round}`
}
export function nativeAnnouncements(home: HomeResponse) {
  const unique = new Map(
    [...home.announcements, ...(home.platformAnnouncements || [])].map((post) => [post.id, post]),
  )
  return [...unique.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}
export function nativeFocusMatches(matches: NativeFocusMatch[], now = Date.now(), limit = 2) {
  const all = [
    ...new Map(
      matches
        .filter(
          (m) =>
            !['DRAFT', 'CANCELLED', 'ABANDONED'].includes(m.status) &&
            !m.statusReason?.startsWith('组委会裁定'),
        )
        .map((m) => [m.id, m]),
    ).values(),
  ]
  const finished = all.filter((m) => ended(m) && scored(m)).sort((a, b) => time(b) - time(a))
  if (all.length && all.every(ended)) {
    const finals = all.filter(final).sort((a, b) => time(b) - time(a))
    const men = finals.find((m) => gender(m.focusGender || '') === 'MEN'),
      women = finals.find((m) => gender(m.focusGender || '') === 'WOMEN')
    if (men && women) return [men, women]
    return [...new Map([...finals, ...finished, ...all].map((m) => [m.id, m])).values()].slice(
      0,
      limit,
    )
  }
  const upcoming = all
    .filter((m) => ['SCHEDULED', 'CHECK_IN'].includes(m.status) && time(m) >= now)
    .sort((a, b) => time(a) - time(b))
  const live = all.filter((m) => m.status === 'LIVE').sort((a, b) => time(a) - time(b))
  return [
    ...new Map(
      [...finished.slice(0, 1), ...upcoming, ...live, ...finished.slice(1)].map((m) => [m.id, m]),
    ).values(),
  ].slice(0, limit)
}
export function nativeFocusTournaments(catalog: Catalog, tournamentId: string) {
  const selected = catalog.tournaments.find((t) => t.id === tournamentId)
  const competition = catalog.competitions.find((c) => c.id === selected?.competitionDefinitionId)
  if (!selected || !competition) return [{ id: tournamentId, gender: '', cupName: '' }]
  return catalog.tournaments
    .filter(
      (t) =>
        t.seasonId === selected.seasonId &&
        t.status !== 'DRAFT' &&
        catalog.competitions.some(
          (c) => c.id === t.competitionDefinitionId && c.cupName === competition.cupName,
        ),
    )
    .map((t) => ({
      id: t.id,
      cupName: competition.cupName,
      gender: catalog.competitions.find((c) => c.id === t.competitionDefinitionId)?.gender || '',
    }))
}
