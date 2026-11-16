import type { HomeResponse, MatchSummary } from '../../features/product/product.types'
import type { Catalog } from '../../features/campus/campus.repository.h5'
import { formatDate, formatTime } from '../../features/product/product.format.weapp.ts'
import {
  focusCardGender,
  focusFinished,
  knockoutRoundLabel,
  selectFocusCards,
} from '@xiaoqiu/contracts'

export type NativeFocusMatch = MatchSummary & { focusGender?: string; focusCupName?: string }
const ended = (m: MatchSummary) => focusFinished(m.status)
const scored = (m: MatchSummary) => m.homeScore !== null && m.awayScore !== null
const time = (m: MatchSummary) =>
  m.scheduledStartAt && Number.isFinite(Date.parse(m.scheduledStartAt))
    ? Date.parse(m.scheduledStartAt)
    : 0
const gender = focusCardGender
export function nativeFocusValue(match: MatchSummary) {
  return scored(match)
    ? `${match.homeScore} : ${match.awayScore}`
    : ended(match)
      ? '待补比分'
      : match.scheduledStartAt
        ? `${formatDate(match.scheduledStartAt)}\n${formatTime(match.scheduledStartAt)}`
        : '待定'
}
function nativeFocusRound(match: NativeFocusMatch) {
  const source = `${match.roundName || ''} ${match.title || ''} ${match.stageName || ''}`
  const knockout = knockoutRoundLabel(match)
  if (knockout) return knockout
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
export function nativeFocusMatches(matches: NativeFocusMatch[], now = Date.now()) {
  return selectFocusCards(
    [...matches].sort((a, b) => {
      if (ended(a) !== ended(b)) return ended(a) ? -1 : 1
      if (ended(a) && ended(b)) return Number(scored(b)) - Number(scored(a)) || time(b) - time(a)
      const kickoff = (item: NativeFocusMatch) => (time(item) >= now ? time(item) : Infinity)
      return kickoff(a) - kickoff(b) || time(b) - time(a)
    }),
  )
}
export function nativeFocusTournaments(catalog: Catalog, tournamentId: string) {
  const selected = catalog.tournaments.find((t) => t.id === tournamentId)
  const competition = catalog.competitions.find((c) => c.id === selected?.competitionDefinitionId)
  if (!selected || !competition) return [{ id: tournamentId, gender: '', cupName: '' }]
  return catalog.tournaments
    .filter(
      (t) =>
        t.seasonId === selected.seasonId &&
        t.status === 'PUBLISHED' &&
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
