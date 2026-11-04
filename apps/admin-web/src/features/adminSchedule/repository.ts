import { requireAdminApi } from '../adminAuth/config'
import { requestAdmin } from '../adminAuth/request'
import type {
  AdminScheduleRepository,
  AdminScheduleSnapshot,
  CreateMatchInput,
  CreateSchedulePlanInput,
  CreateSeasonInput,
  CreateTeamInput,
  CreateTournamentInput,
  CreateVenueInput,
  Match,
  OrganizationContext,
  PublishRuleVersionInput,
  RuleVersion,
  SchedulePlan,
  Season,
  Team,
  Tournament,
  Venue,
} from './types'

export function createAdminScheduleRepository(): AdminScheduleRepository {
  return new HttpAdminScheduleRepository(requireAdminApi())
}

class HttpAdminScheduleRepository implements AdminScheduleRepository {
  readonly mode = 'api' as const

  readonly apiBaseUrl: string

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = normalizeApiBaseUrl(apiBaseUrl)
  }

  async loadSnapshot(context: OrganizationContext): Promise<AdminScheduleSnapshot> {
    const snapshot = await this.request<ApiAdminScheduleSnapshot>(
      context,
      '/admin/schedule-workbench',
    )
    return mapSnapshot(snapshot)
  }

  async createSeason(context: OrganizationContext, input: CreateSeasonInput): Promise<Season> {
    const season = await this.request<ApiSeason>(context, '/admin/seasons', {
      method: 'POST',
      body: {
        seasonCode: input.code,
        name: input.name,
        startsOn: `${input.year}-09-01`,
      },
    })
    return mapSeason(season)
  }

  async createTournament(
    context: OrganizationContext,
    input: CreateTournamentInput,
  ): Promise<Tournament> {
    const tournament = await this.request<ApiTournament>(context, '/admin/tournaments', {
      method: 'POST',
      body: {
        seasonId: input.seasonId,
        tournamentCode: input.code,
        name: input.name,
      },
    })
    return mapTournament(tournament)
  }

  async publishRuleVersion(
    context: OrganizationContext,
    input: PublishRuleVersionInput,
  ): Promise<RuleVersion> {
    const ruleVersion = await this.request<ApiRuleVersion>(
      context,
      `/admin/tournaments/${input.tournamentId}/rule-versions`,
      {
        method: 'POST',
        body: {
          version: input.version,
          name: `规则 v${input.version}`,
          rules: { summary: input.summary },
        },
      },
    )
    return mapRuleVersion(ruleVersion)
  }

  async createTeam(context: OrganizationContext, input: CreateTeamInput): Promise<Team> {
    const team = await this.request<ApiTeam>(
      context,
      `/admin/tournaments/${input.tournamentId}/teams`,
      {
        method: 'POST',
        body: {
          teamCode: input.code,
          name: input.name,
          shortName: input.shortName,
        },
      },
    )
    return mapTeam(team)
  }

  async createVenue(context: OrganizationContext, input: CreateVenueInput): Promise<Venue> {
    const venue = await this.request<ApiVenue>(context, '/admin/venues', {
      method: 'POST',
      body: {
        venueCode: input.code,
        name: input.name,
        address: [input.campus, input.location].filter(Boolean).join(' / '),
      },
    })
    return mapVenue(venue)
  }

  async createMatch(context: OrganizationContext, input: CreateMatchInput): Promise<Match> {
    const match = await this.request<ApiMatch>(
      context,
      `/admin/tournaments/${input.tournamentId}/matches`,
      {
        method: 'POST',
        body: {
          matchCode: `match-${Date.now().toString(36)}`,
          title: '赛程比赛',
          homeTeamId: input.homeTeamId,
          awayTeamId: input.awayTeamId,
          venueId: input.venueId,
          scheduledStartAt: new Date(input.scheduledStartAt).toISOString(),
        },
      },
    )
    return mapMatch(match)
  }

  async createSchedulePlan(
    context: OrganizationContext,
    input: CreateSchedulePlanInput,
  ): Promise<SchedulePlan> {
    const plan = await this.request<ApiSchedulePlan>(context, '/admin/schedule-plans', {
      method: 'POST',
      body: input,
    })
    return mapSchedulePlan(plan)
  }

  async validateSchedulePlan(context: OrganizationContext, planId: string): Promise<SchedulePlan> {
    const plan = await this.request<ApiSchedulePlan>(
      context,
      `/admin/schedule-plans/${planId}/validate`,
      {
        method: 'POST',
      },
    )
    return {
      ...mapSchedulePlan(plan),
      validationMessage: '校验通过：后端已确认草案包含可发布比赛。',
    }
  }

  async publishSchedulePlan(context: OrganizationContext, planId: string): Promise<SchedulePlan> {
    const revision = await this.request<ApiScheduleRevision>(
      context,
      `/admin/schedule-plans/${planId}/publish`,
      {
        method: 'POST',
      },
    )
    return {
      id: planId,
      tournamentId: revision.tournamentId,
      name: '已发布赛程',
      matchIds: [],
      status: 'PUBLISHED',
      version: revision.version,
      validationMessage: '已发布，后续变更必须创建替代版本。',
      publishedVersion: revision.version,
      publishedAt: revision.publishedAt,
      updatedAt: revision.publishedAt,
    }
  }

  private async request<T>(
    context: OrganizationContext,
    path: string,
    options: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ): Promise<T> {
    return requestAdmin<T>(this.apiBaseUrl, context, path, options)
  }
}

interface ApiSeason {
  id: string
  seasonCode: string
  name: string
  startsOn?: string | null
}

interface ApiTournament {
  id: string
  seasonId: string
  tournamentCode: string
  name: string
  status: Tournament['status']
}

interface ApiRuleVersion {
  id: string
  tournamentId: string
  version: number
  name: string
  rules: Record<string, unknown>
  status: RuleVersion['status']
  publishedAt: string
}

interface ApiTeam {
  id: string
  teamCode: string
  name: string
  shortName?: string | null
}

interface ApiVenue {
  id: string
  venueCode: string
  name: string
  address?: string | null
}

interface ApiMatch {
  id: string
  tournamentId: string
  status: Match['status']
  scheduledStartAt?: string | null
  homeTeam?: { id: string } | null
  awayTeam?: { id: string } | null
  venue?: { id: string } | null
}

interface ApiSchedulePlan {
  id: string
  tournamentId: string
  name: string
  status: SchedulePlan['status']
  publishedAt?: string | null
  matchIds?: string[]
}

interface ApiScheduleRevision {
  tournamentId: string
  version: number
  publishedAt: string
}

export interface ApiAdminScheduleSnapshot {
  seasons: ApiSeason[]
  tournaments: ApiTournament[]
  ruleVersions: ApiRuleVersion[]
  teams: ApiTeam[]
  venues: ApiVenue[]
  matches: ApiMatch[]
  schedulePlans: ApiSchedulePlan[]
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

export function mapSnapshot(snapshot: ApiAdminScheduleSnapshot): AdminScheduleSnapshot {
  return {
    seasons: snapshot.seasons.map(mapSeason),
    tournaments: snapshot.tournaments.map(mapTournament),
    ruleVersions: snapshot.ruleVersions.map(mapRuleVersion),
    teams: snapshot.teams.map(mapTeam),
    venues: snapshot.venues.map(mapVenue),
    matches: snapshot.matches.map(mapMatch),
    schedulePlans: snapshot.schedulePlans.map(mapSchedulePlan),
  }
}

function mapSeason(season: ApiSeason): Season {
  return {
    id: season.id,
    code: season.seasonCode,
    name: season.name,
    year: extractYear(season.startsOn ?? season.seasonCode),
    createdAt: toDisplayDate(season.startsOn),
  }
}

function mapTournament(tournament: ApiTournament): Tournament {
  return {
    id: tournament.id,
    seasonId: tournament.seasonId,
    code: tournament.tournamentCode,
    name: tournament.name,
    status: tournament.status,
    createdAt: new Date(0).toISOString(),
  }
}

function mapRuleVersion(ruleVersion: ApiRuleVersion): RuleVersion {
  const summary =
    typeof ruleVersion.rules.summary === 'string' ? ruleVersion.rules.summary : ruleVersion.name
  return {
    id: ruleVersion.id,
    tournamentId: ruleVersion.tournamentId,
    version: ruleVersion.version,
    summary,
    status: ruleVersion.status,
    publishedAt: ruleVersion.publishedAt,
  }
}

function mapTeam(team: ApiTeam): Team {
  return {
    id: team.id,
    code: team.teamCode,
    name: team.name,
    shortName: team.shortName ?? '',
    crestPlaceholder: '默认队徽',
    createdAt: new Date(0).toISOString(),
  }
}

function mapVenue(venue: ApiVenue): Venue {
  const [campus = '', ...locationParts] = (venue.address ?? '').split(' / ')
  return {
    id: venue.id,
    code: venue.venueCode,
    name: venue.name,
    campus,
    location: locationParts.join(' / '),
    createdAt: new Date(0).toISOString(),
  }
}

function mapMatch(match: ApiMatch): Match {
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    homeTeamId: match.homeTeam?.id ?? '',
    awayTeamId: match.awayTeam?.id ?? '',
    venueId: match.venue?.id ?? '',
    scheduledStartAt: match.scheduledStartAt ?? '',
    status: match.status,
    createdAt: new Date(0).toISOString(),
  }
}

function mapSchedulePlan(plan: ApiSchedulePlan): SchedulePlan {
  return {
    id: plan.id,
    tournamentId: plan.tournamentId,
    name: plan.name,
    matchIds: plan.matchIds ?? [],
    status: plan.status,
    version: plan.status === 'PUBLISHED' ? 2 : 1,
    validationMessage:
      plan.status === 'PUBLISHED'
        ? '已发布，后续变更必须创建替代版本。'
        : '可先校验草案；发布时后端会再次检查可发布条件。',
    publishedVersion: plan.status === 'PUBLISHED' ? 1 : null,
    publishedAt: plan.publishedAt ?? null,
    updatedAt: plan.publishedAt ?? new Date().toISOString(),
  }
}

function extractYear(value: string): number {
  const match = value.match(/\d{4}/)
  return match === null ? new Date().getFullYear() : Number(match[0])
}

function toDisplayDate(value: string | null | undefined): string {
  return value === null || value === undefined
    ? new Date(0).toISOString()
    : new Date(value).toISOString()
}
