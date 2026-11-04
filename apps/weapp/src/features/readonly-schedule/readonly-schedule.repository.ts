import { leagueDay } from '../product/league-time.ts'
import Taro from '@tarojs/taro'
import { apiRequest } from '../cloud-api/request'
import { cloudApiFailureMessage } from '../cloud-api/proxy.logic'
import { clearSession, readSession } from '../product/session'
import { prepareCompetitionSelection, scopeProductPath } from '../product/tournament-scope'
import { anonymousReadAllowed } from '../product-config/access-boundary.logic'
import {
  getConfiguration,
  markAccountInvalid,
  readAccountPresence,
} from '../product-config/policy-state'

import { readonlyScheduleMockFixture } from './mock-fixture'
import { sortMatchesByStartAt } from './readonly-schedule.logic'
import type {
  MatchStatus,
  PublicDataSource,
  ReadonlyMatch,
  ReadonlyTeam,
  ReadonlyTeamSummary,
  ReadonlyTournamentDetail,
  ReadonlyTournamentSummary,
} from './readonly-schedule.types'

const DEFAULT_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'

interface RepositoryResult<T> {
  data: T
  source: PublicDataSource
}

interface ApiContext {
  baseUrl: string
  organizationId: string
}

interface ApiTournamentList {
  items: ApiTournament[]
}

interface ApiTournament {
  hasPublishedSchedule?: boolean
  id: string
  seasonId: string
  tournamentCode: string
  name: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}

interface ApiSeason {
  id: string
  seasonCode: string
  name: string
}

interface ApiRuleVersion {
  version: number
  name: string
  rules: Record<string, unknown>
}

interface ApiTournamentDetail extends ApiTournament {
  season: ApiSeason
  ruleVersions: ApiRuleVersion[]
}

interface ApiScheduleRevision {
  version: number
  publishedAt: string
}

interface ApiMatchTeam {
  id: string
  teamCode: string
  name: string
  shortName?: string | null
}

interface ApiMatchVenue {
  id: string
  venueCode: string
  name: string
}

interface ApiMatch {
  id: string
  tournamentId: string
  matchCode: string
  title: string
  status: MatchStatus
  scheduledStartAt?: string | null
  homeTeam?: ApiMatchTeam | null
  awayTeam?: ApiMatchTeam | null
  venue?: ApiMatchVenue | null
}

interface ApiTournamentSchedule {
  tournament: ApiTournament
  revision: ApiScheduleRevision
  matches: ApiMatch[]
}

interface ApiPublicTeamSummary {
  id: string
  tournamentId: string
  teamCode: string
  name: string
  shortName?: string | null
  registrationStatus: string
  rosterStatus: string
  rosterPlayerCount: number
}

interface ApiPublicRosterPlayer {
  id: string
  displayName: string
  shirtNumber?: string | null
}

interface ApiPublicTeamDetail extends ApiPublicTeamSummary {
  leaderDisplayName?: string | null
  coachDisplayName?: string | null
  rosterSnapshotVersion?: number | null
  players: ApiPublicRosterPlayer[]
}

type ApiPublicTeamList = { items: ApiPublicTeamSummary[] } | ApiPublicTeamSummary[]

export class PublicApiRequestError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

class ReadonlyScheduleRepository {
  async listTournaments(
    ignoreSelection = false,
  ): Promise<RepositoryResult<ReadonlyTournamentSummary[]>> {
    const apiContext = getApiContext()
    if (!apiContext) {
      return {
        data: readonlyScheduleMockFixture.tournaments.map(toTournamentSummary),
        source: 'mock',
      }
    }

    const list = await requestApi<ApiTournamentList>(
      apiContext,
      '/public/tournaments',
      !ignoreSelection,
    )
    const details = await Promise.all(
      list.items
        .filter((tournament) => tournament.hasPublishedSchedule !== false)
        .map((tournament) => this.loadApiTournamentDetail(apiContext, tournament.id)),
    )

    return {
      data: details.map(toTournamentSummary),
      source: 'api',
    }
  }

  async getTournament(
    tournamentId: string,
  ): Promise<RepositoryResult<ReadonlyTournamentDetail | null>> {
    const apiContext = getApiContext()
    if (!apiContext) {
      const tournament =
        readonlyScheduleMockFixture.tournaments.find((item) => item.id === tournamentId) ?? null
      return { data: tournament, source: 'mock' }
    }

    try {
      return {
        data: await this.loadApiTournamentDetail(apiContext, tournamentId),
        source: 'api',
      }
    } catch (error) {
      if (error instanceof PublicApiRequestError && error.statusCode === 404) {
        return { data: null, source: 'api' }
      }
      throw error
    }
  }

  async listMatches(tournamentId: string): Promise<RepositoryResult<ReadonlyMatch[]>> {
    const apiContext = getApiContext()
    if (!apiContext) {
      const tournament = readonlyScheduleMockFixture.tournaments.find(
        (item) => item.id === tournamentId,
      )
      return {
        data: tournament?.recentMatches ?? [],
        source: 'mock',
      }
    }

    const schedule = await requestApi<ApiTournamentSchedule>(
      apiContext,
      `/public/tournaments/${encodeURIComponent(tournamentId)}/schedule`,
    )
    return {
      data: schedule.matches.map(mapMatch),
      source: 'api',
    }
  }

  async getMatch(matchId: string): Promise<RepositoryResult<ReadonlyMatch | null>> {
    const apiContext = getApiContext()
    if (!apiContext) {
      const matches = readonlyScheduleMockFixture.tournaments.flatMap(
        (tournament) => tournament.recentMatches,
      )
      return {
        data: matches.find((match) => match.id === matchId) ?? null,
        source: 'mock',
      }
    }

    try {
      const match = await requestApi<ApiMatch>(
        apiContext,
        `/public/matches/${encodeURIComponent(matchId)}`,
      )
      return { data: mapMatch(match), source: 'api' }
    } catch (error) {
      if (error instanceof PublicApiRequestError && error.statusCode === 404) {
        return { data: null, source: 'api' }
      }
      throw error
    }
  }

  async listTeams(tournamentId: string): Promise<RepositoryResult<ReadonlyTeamSummary[]>> {
    const apiContext = getApiContext()
    if (!apiContext) {
      const tournament = readonlyScheduleMockFixture.tournaments.find(
        (item) => item.id === tournamentId,
      )
      return { data: tournament?.teams ?? [], source: 'mock' }
    }

    const response = await requestApi<ApiPublicTeamList>(
      apiContext,
      `/public/tournaments/${encodeURIComponent(tournamentId)}/teams`,
    )
    const items = Array.isArray(response) ? response : response.items
    return { data: items.map(mapTeamSummary), source: 'api' }
  }

  async getTeam(
    tournamentId: string,
    teamId: string,
  ): Promise<RepositoryResult<ReadonlyTeam | null>> {
    const apiContext = getApiContext()
    if (!apiContext) {
      const team =
        readonlyScheduleMockFixture.teamDetails.find(
          (item) => item.tournamentId === tournamentId && item.id === teamId,
        ) ?? null
      return { data: team, source: 'mock' }
    }

    try {
      const team = await requestApi<ApiPublicTeamDetail>(
        apiContext,
        `/public/tournaments/${encodeURIComponent(tournamentId)}/teams/${encodeURIComponent(teamId)}`,
      )
      return { data: mapTeamDetail(team), source: 'api' }
    } catch (error) {
      if (error instanceof PublicApiRequestError && error.statusCode === 404) {
        return { data: null, source: 'api' }
      }
      throw error
    }
  }

  private async loadApiTournamentDetail(
    apiContext: ApiContext,
    tournamentId: string,
  ): Promise<ReadonlyTournamentDetail> {
    const encodedId = encodeURIComponent(tournamentId)
    const [detail, schedule, teamList] = await Promise.all([
      requestApi<ApiTournamentDetail>(apiContext, `/public/tournaments/${encodedId}`),
      requestApi<ApiTournamentSchedule>(apiContext, `/public/tournaments/${encodedId}/schedule`),
      requestApi<ApiPublicTeamList>(apiContext, `/public/tournaments/${encodedId}/teams`),
    ])
    const teams = Array.isArray(teamList) ? teamList : teamList.items

    return mapTournamentDetail(detail, schedule, teams)
  }
}

export const readonlyScheduleRepository = new ReadonlyScheduleRepository()

function mapTournamentDetail(
  detail: ApiTournamentDetail,
  schedule: ApiTournamentSchedule,
  apiTeams: ApiPublicTeamSummary[],
): ReadonlyTournamentDetail {
  const matches = sortMatchesByStartAt(schedule.matches.map(mapMatch))
  const teams = apiTeams.map(mapTeamSummary)

  return {
    id: detail.id,
    name: detail.name,
    code: detail.tournamentCode,
    seasonName: detail.season.name,
    organizationName: '校园赛事组织',
    statusText: getTournamentStatusText(detail.status),
    startDate: formatDateRangePoint(matches.at(0)?.scheduledStartAt),
    endDate: formatDateRangePoint(matches.at(-1)?.scheduledStartAt),
    teamCount: teams.length,
    matchCount: matches.length,
    description: `已发布赛程 v${schedule.revision.version}`,
    rules: detail.ruleVersions.map(mapRuleText),
    teams,
    recentMatches: matches,
  }
}

function toTournamentSummary(tournament: ReadonlyTournamentDetail): ReadonlyTournamentSummary {
  const {
    id,
    name,
    code,
    seasonName,
    organizationName,
    statusText,
    startDate,
    endDate,
    teamCount,
    matchCount,
    description,
  } = tournament

  return {
    id,
    name,
    code,
    seasonName,
    organizationName,
    statusText,
    startDate,
    endDate,
    teamCount,
    matchCount,
    description,
  }
}

function mapMatch(match: ApiMatch): ReadonlyMatch {
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    stageName: inferStageName(match.title),
    roundName: match.title || match.matchCode,
    scheduledStartAt: match.scheduledStartAt ?? new Date(0).toISOString(),
    venueName: match.venue?.name ?? '待定场地',
    pitchName: '',
    homeTeamId: match.homeTeam?.id ?? '',
    awayTeamId: match.awayTeam?.id ?? '',
    homeTeamName: match.homeTeam?.name ?? '待定主队',
    awayTeamName: match.awayTeam?.name ?? '待定客队',
    status: match.status,
  }
}

function mapTeamSummary(team: ApiPublicTeamSummary): ReadonlyTeamSummary {
  return {
    id: team.id,
    tournamentId: team.tournamentId,
    teamCode: team.teamCode,
    name: team.name,
    shortName: team.shortName ?? team.name,
    registrationStatus: team.registrationStatus,
    rosterStatus: team.rosterStatus,
    rosterPlayerCount: team.rosterPlayerCount,
  }
}

function mapTeamDetail(team: ApiPublicTeamDetail): ReadonlyTeam {
  return {
    ...mapTeamSummary(team),
    leaderDisplayName: team.leaderDisplayName ?? null,
    coachDisplayName: team.coachDisplayName ?? null,
    rosterSnapshotVersion: team.rosterSnapshotVersion ?? null,
    players: team.players.map((player) => ({
      id: player.id,
      displayName: player.displayName,
      shirtNumber: player.shirtNumber ?? null,
    })),
  }
}

function mapRuleText(ruleVersion: ApiRuleVersion): string {
  const summary = ruleVersion.rules.summary
  return typeof summary === 'string' ? summary : ruleVersion.name
}

function getTournamentStatusText(status: ApiTournament['status']): string {
  switch (status) {
    case 'DRAFT':
      return '草稿'
    case 'PUBLISHED':
      return '已发布'
    case 'ARCHIVED':
      return '已归档'
  }
}

function inferStageName(title: string): string {
  if (title.includes('决赛')) return '淘汰赛'
  if (title.includes('八强') || title.includes('四强')) return '淘汰赛'
  return '小组赛'
}

function formatDateRangePoint(value: string | undefined): string {
  if (!value) {
    return '待定'
  }

  return leagueDay(value)
}

async function requestApi<T>(
  apiContext: ApiContext,
  path: string,
  selectCompetition = true,
): Promise<T> {
  const h5 = Taro.getEnv() === Taro.ENV_TYPE.WEB
  const account = h5 ? readAccountPresence() : null
  const session = h5 ? account?.session : readSession()
  if (h5 && !session) {
    let allowed = false
    if (account && !account.needsAccount) {
      try {
        allowed = anonymousReadAllowed(path, 'GET', await getConfiguration(), readAccountPresence())
      } catch {
        /* fail closed without offline/mock fallback */
      }
    }
    if (!allowed) throw new PublicApiRequestError(401, '请先登录账号后再访问晓球')
  }
  if (h5 && selectCompetition) {
    await prepareCompetitionSelection(path)
    path = scopeProductPath(path)
  }
  const response = await apiRequest<T>({
    url: `${apiContext.baseUrl}${path}`,
    method: 'GET',
    header: {
      'x-organization-id': session?.user.organizationId ?? apiContext.organizationId,
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    timeout: 5000,
  }).catch((error: unknown) => {
    throw new PublicApiRequestError(
      0,
      cloudApiFailureMessage(error) || '无法连接晓球 API，请检查网络或联系管理员后重试。',
    )
  })

  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 401) {
      if (h5 && session && readSession()?.accessToken === session.accessToken) markAccountInvalid()
      else if (!h5) clearSession()
    }
    throw new PublicApiRequestError(
      response.statusCode,
      readErrorMessage(response.data, response.statusCode),
    )
  }

  if (response.data === undefined || response.data === null) {
    throw new PublicApiRequestError(response.statusCode, 'API 返回为空')
  }

  return response.data
}

function readErrorMessage(data: unknown, statusCode: number): string {
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const message = (data as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }

  return `API 请求失败：HTTP ${statusCode}`
}

function getApiContext(): ApiContext | undefined {
  const baseUrl = process.env.TARO_APP_API_BASE_URL
  if (!baseUrl || baseUrl.trim().length === 0) {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      throw new PublicApiRequestError(0, '尚未配置晓球 API 地址，请联系管理员。')
    }
    return undefined
  }

  return {
    baseUrl: normalizeApiBaseUrl(baseUrl),
    organizationId: process.env.TARO_APP_ORGANIZATION_ID?.trim() || DEFAULT_ORGANIZATION_ID,
  }
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}
