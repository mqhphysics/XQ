/**
 * Pure mapping between the public competition catalog and the switcher UI:
 * cup + gender + season → competition definition → (optional) published tournament.
 * Kept free of runtime imports so it can be unit-tested directly with node:test.
 */
import type { Catalog } from './campus.repository.h5'

export type Gender = 'MALE' | 'FEMALE'
export type CupStatus = 'live' | 'ended' | 'upcoming'
type Competition = Catalog['competitions'][number]
type Season = Catalog['seasons'][number]
type Tournament = Catalog['tournaments'][number]

export interface CupRow {
  cupName: string
  competition: Competition
  tournament: Tournament | undefined
  status: CupStatus
}

export interface CompetitionPick {
  competition: Competition
  season: Season
  tournament: Tournament | undefined
}

/** Display order requested for the switcher; unknown cups follow by catalog sort order. */
export const CUP_ORDER = ['绿茵杯', '计科杯', '新生杯'] as const
export const GENDERS: ReadonlyArray<{ id: Gender; label: string }> = [
  { id: 'MALE', label: '男子组' },
  { id: 'FEMALE', label: '女子组' },
]
export const STATUS_LABEL: Record<CupStatus, string> = {
  live: '进行中',
  ended: '已结束',
  upcoming: '即将开始',
}

export function genderLabel(gender: string | undefined): string {
  return gender === 'FEMALE' ? '女子组' : '男子组'
}

export function cupNameOf(competition: Competition): string {
  return competition.cupName || competition.name
}

export function seasonLabel(season: Season): string {
  return season.isDemo ? '演示赛季' : season.name
}

export function tournamentStatus(tournament: Tournament | undefined): CupStatus {
  if (!tournament) return 'upcoming'
  return tournament.status === 'PUBLISHED' ? 'live' : 'ended'
}

function tournamentFor(catalog: Catalog, competitionId: string, seasonId: string) {
  return catalog.tournaments.find(
    (t) => t.competitionDefinitionId === competitionId && t.seasonId === seasonId,
  )
}

/** Formal seasons first (newest name first), demo seasons last. */
export function orderedSeasons(catalog: Catalog): Season[] {
  return [...catalog.seasons].sort(
    (a, b) => Number(a.isDemo) - Number(b.isDemo) || b.name.localeCompare(a.name, 'zh-CN'),
  )
}

/** One row per cup for the given gender and season, in CUP_ORDER. */
export function cupRows(catalog: Catalog, gender: string, seasonId: string): CupRow[] {
  const rank = (name: string) => {
    const index = (CUP_ORDER as readonly string[]).indexOf(name)
    return index < 0 ? CUP_ORDER.length : index
  }
  return catalog.competitions
    .filter((competition) => competition.gender === gender)
    .sort(
      (a, b) =>
        rank(cupNameOf(a)) - rank(cupNameOf(b)) ||
        a.sortOrder - b.sortOrder ||
        a.id.localeCompare(b.id),
    )
    .map((competition) => {
      const tournament = tournamentFor(catalog, competition.id, seasonId)
      return {
        cupName: cupNameOf(competition),
        competition,
        tournament,
        status: tournamentStatus(tournament),
      }
    })
}

/** Resolve cup + gender + season to the matching competition and its tournament (if any). */
export function resolvePick(
  catalog: Catalog,
  cupName: string,
  gender: string,
  seasonId: string,
): CompetitionPick | undefined {
  const season = catalog.seasons.find((s) => s.id === seasonId)
  const competition =
    catalog.competitions.find((c) => cupNameOf(c) === cupName && c.gender === gender) ??
    cupRows(catalog, gender, seasonId)[0]?.competition
  if (!season || !competition) return undefined
  return { competition, season, tournament: tournamentFor(catalog, competition.id, season.id) }
}

/** Find the competition and season a tournament belongs to. */
export function pickForTournament(
  catalog: Catalog,
  tournamentId: string | undefined,
): CompetitionPick | undefined {
  if (!tournamentId) return undefined
  const tournament = catalog.tournaments.find((t) => t.id === tournamentId)
  if (!tournament) return undefined
  const competition = catalog.competitions.find((c) => c.id === tournament.competitionDefinitionId)
  const season = catalog.seasons.find((s) => s.id === tournament.seasonId)
  return competition && season ? { competition, season, tournament } : undefined
}

/** Look up a stored competition + season pair. */
export function pickForIds(
  catalog: Catalog,
  competitionId: string | undefined,
  seasonId: string | undefined,
): CompetitionPick | undefined {
  const competition = catalog.competitions.find((c) => c.id === competitionId)
  const season = catalog.seasons.find((s) => s.id === seasonId)
  if (!competition || !season) return undefined
  return { competition, season, tournament: tournamentFor(catalog, competition.id, season.id) }
}

/**
 * Default selection: an explicit route tournament wins, then the stored pair, then
 * the newest published formal season, with a male competition preferred.
 */
export function defaultPick(
  catalog: Catalog,
  stored: { competitionId?: string | undefined; seasonId?: string | undefined },
  routeTournamentId?: string,
): CompetitionPick | undefined {
  const routed = pickForTournament(catalog, routeTournamentId)
  if (routed) return routed
  const published = orderedSeasons(catalog)
    .filter((s) => !s.isDemo)
    .flatMap((season) =>
      [...catalog.competitions]
        .sort((a, b) => Number(b.gender === 'MALE') - Number(a.gender === 'MALE'))
        .map((competition) => ({
          competition,
          season,
          tournament: tournamentFor(catalog, competition.id, season.id),
        })),
    )
    .find((pick) => pick.tournament?.status === 'PUBLISHED')
  const competition =
    catalog.competitions.find((c) => c.id === stored.competitionId) ??
    catalog.competitions.find((c) => cupNameOf(c) === '新生杯' && c.gender === 'MALE') ??
    published?.competition ??
    catalog.competitions.find((c) => c.code === 'GREEN_MEN') ??
    cupRows(catalog, 'MALE', '')[0]?.competition ??
    catalog.competitions[0]
  // Without a stored choice: the newest formal season that already has this cup, else the
  // demo season's — an announced but empty season (e.g. 2026 before kickoff) never becomes the
  // landing view; it stays one click away with its 即将开赛 state.
  const season =
    catalog.seasons.find((s) => s.id === stored.seasonId) ??
    (published && published.competition.id === competition?.id ? published.season : undefined) ??
    orderedSeasons(catalog).find((s) => tournamentFor(catalog, competition?.id ?? '', s.id)) ??
    orderedSeasons(catalog)[0] ??
    catalog.seasons[0]
  if (!competition || !season) return undefined
  return { competition, season, tournament: tournamentFor(catalog, competition.id, season.id) }
}

/** Chip text parts: title ('2026 绿茵杯') and group ('男子组'). */
export function pickLabel(pick: CompetitionPick): { title: string; group: string } {
  return {
    title: pick.tournament?.name ?? `${seasonLabel(pick.season)} ${cupNameOf(pick.competition)}`,
    group: genderLabel(pick.competition.gender),
  }
}

/**
 * The tournament to fall back to when the selection has none: 绿茵杯男子组 in the newest
 * formal season when it is published, otherwise the first published tournament.
 */
export function activePick(catalog: Catalog): CompetitionPick | undefined {
  const preferred = defaultPick(catalog, {})
  if (preferred?.tournament) return preferred
  for (const season of orderedSeasons(catalog)) {
    for (const gender of ['MALE', 'FEMALE']) {
      const row = cupRows(catalog, gender, season.id).find((item) => item.tournament)
      if (row) return { competition: row.competition, season, tournament: row.tournament }
    }
  }
  return undefined
}

/** Empty-state headline, e.g. '2026 绿茵杯 · 女子组 即将开赛'. */
export function upcomingTitle(pick: CompetitionPick): string {
  const label = pickLabel(pick)
  return `${label.title} · ${label.group} 即将开赛`
}
