import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { validateTournamentSelection } from '../common/public-tournament'

import { ApiHttpException } from '../common/api-http.exception'
import { getRequestId, type RequestWithId } from '../common/request-context'
import {
  AuditActorType,
  MatchStatus,
  OutboxJobStatus,
  SchedulePlanStatus,
  TeamRegistrationStatus,
  TournamentStatus,
  type Prisma,
} from '../generated/prisma/client'
import { PrismaService } from '../database/prisma.service'
import { eightASideRuleDocument } from './eight-a-side-rules'
import type {
  CreateCompetitionRuleVersionDto,
  CreateMatchDto,
  CreateSchedulePlanDto,
  CreateSeasonDto,
  CreateTeamDto,
  CreateTournamentDto,
  CreateVenueDto,
} from './schedule.dto'

const MATCH_INCLUDE = {
  awayTeam: true,
  homeTeam: true,
  venue: true,
} as const

type MatchWithRelations = Prisma.MatchGetPayload<{ include: typeof MATCH_INCLUDE }>

@Injectable()
export class ScheduleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getAdminScheduleWorkbench(organizationId: string, tournamentIds: string[] | null = null) {
    const tournamentScope = tournamentIds === null ? {} : { tournamentId: { in: tournamentIds } }
    const seasons = await this.prisma.season.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        organizationId,
        ...(tournamentIds === null ? {} : { tournaments: { some: { id: { in: tournamentIds } } } }),
      },
    })
    const tournaments = await this.prisma.tournament.findMany({
      orderBy: { createdAt: 'desc' },
      where: { organizationId, ...(tournamentIds === null ? {} : { id: { in: tournamentIds } }) },
    })
    const ruleVersions = await this.prisma.competitionRuleVersion.findMany({
      orderBy: [{ tournamentId: 'asc' }, { version: 'desc' }],
      where: { organizationId, ...tournamentScope },
    })
    const teams = await this.prisma.team.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        organizationId,
        ...(tournamentIds === null
          ? {}
          : { registrations: { some: { organizationId, tournamentId: { in: tournamentIds } } } }),
      },
    })
    const venues = await this.prisma.venue.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        organizationId,
        ...(tournamentIds === null
          ? {}
          : { matches: { some: { organizationId, tournamentId: { in: tournamentIds } } } }),
      },
    })
    const matches = await this.prisma.match.findMany({
      include: MATCH_INCLUDE,
      orderBy: [{ scheduledStartAt: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      where: { organizationId, ...tournamentScope },
    })
    const schedulePlans = await this.prisma.schedulePlan.findMany({
      include: {
        matches: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      where: { organizationId, ...tournamentScope },
    })

    return {
      seasons: seasons.map((season) => this.toSeasonView(season)),
      tournaments: tournaments.map((tournament) => this.toTournamentView(tournament)),
      ruleVersions: ruleVersions.map((ruleVersion) => this.toRuleVersionView(ruleVersion)),
      teams: teams.map((team) => this.toTeamView(team)),
      venues: venues.map((venue) => this.toVenueView(venue)),
      matches: matches.map((match) => this.toMatchView(match)),
      schedulePlans: schedulePlans.map((plan) => ({
        ...this.toSchedulePlanView(plan),
        matchIds: plan.matches.map((match) => match.id),
      })),
    }
  }

  async createSeason(organizationId: string, dto: CreateSeasonDto) {
    const data: Prisma.SeasonUncheckedCreateInput = {
      organizationId,
      seasonCode: dto.seasonCode,
      name: dto.name,
    }

    if (dto.startsOn !== undefined) {
      data.startsOn = new Date(dto.startsOn)
    }

    if (dto.endsOn !== undefined) {
      data.endsOn = new Date(dto.endsOn)
    }

    const season = await this.prisma.season.create({ data })

    return this.toSeasonView(season)
  }

  async createTournament(organizationId: string, dto: CreateTournamentDto) {
    await this.requireSeason(organizationId, dto.seasonId)

    const tournament = await this.prisma.tournament.create({
      data: {
        organizationId,
        seasonId: dto.seasonId,
        tournamentCode: dto.tournamentCode,
        name: dto.name,
      },
    })

    return this.toTournamentView(tournament)
  }

  async createRuleVersion(
    organizationId: string,
    tournamentId: string,
    dto: CreateCompetitionRuleVersionDto,
  ) {
    await this.requireTournament(organizationId, tournamentId)

    const ruleVersion = await this.prisma.competitionRuleVersion.create({
      data: {
        organizationId,
        tournamentId,
        version: dto.version,
        name: dto.name,
        rules: eightASideRuleDocument(dto.rules) as Prisma.InputJsonValue,
      },
    })

    return this.toRuleVersionView(ruleVersion)
  }

  async createTeam(organizationId: string, tournamentId: string, dto: CreateTeamDto) {
    await this.requireTournament(organizationId, tournamentId)

    const data: Prisma.TeamUncheckedCreateInput = {
      organizationId,
      teamCode: dto.teamCode,
      name: dto.name,
    }

    if (dto.shortName !== undefined) {
      data.shortName = dto.shortName
    }

    const team = await this.prisma.team.create({ data })

    return this.toTeamView(team)
  }

  async createVenue(organizationId: string, dto: CreateVenueDto) {
    const data: Prisma.VenueUncheckedCreateInput = {
      organizationId,
      venueCode: dto.venueCode,
      name: dto.name,
    }

    if (dto.address !== undefined) {
      data.address = dto.address
    }

    const venue = await this.prisma.venue.create({ data })

    return this.toVenueView(venue)
  }

  async createMatch(organizationId: string, tournamentId: string, dto: CreateMatchDto) {
    await this.requireTournament(organizationId, tournamentId)
    await this.requireOptionalTeam(organizationId, dto.homeTeamId)
    await this.requireOptionalTeam(organizationId, dto.awayTeamId)
    await this.requireOptionalVenue(organizationId, dto.venueId)

    const data: Prisma.MatchUncheckedCreateInput = {
      organizationId,
      tournamentId,
      matchCode: dto.matchCode,
      title: dto.title,
      sortOrder: dto.sortOrder ?? 0,
    }

    if (dto.homeTeamId !== undefined) {
      data.homeTeamId = dto.homeTeamId
    }

    if (dto.awayTeamId !== undefined) {
      data.awayTeamId = dto.awayTeamId
    }

    if (dto.venueId !== undefined) {
      data.venueId = dto.venueId
    }

    if (dto.scheduledStartAt !== undefined) {
      data.scheduledStartAt = new Date(dto.scheduledStartAt)
    }

    const match = await this.prisma.match.create({
      data,
      include: MATCH_INCLUDE,
    })

    return this.toMatchView(match)
  }

  async createSchedulePlan(organizationId: string, dto: CreateSchedulePlanDto) {
    await this.requireTournament(organizationId, dto.tournamentId)
    await this.requireMatches(organizationId, dto.tournamentId, dto.matchIds)

    const plan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.schedulePlan.create({
        data: { organizationId, tournamentId: dto.tournamentId, name: dto.name },
      })
      const reserved = await tx.match.updateMany({
        where: {
          organizationId,
          tournamentId: dto.tournamentId,
          id: { in: dto.matchIds },
          status: MatchStatus.DRAFT,
          schedulePlanId: null,
          scheduleRevisionId: null,
          reportVersion: 0,
          confirmedReportVersion: null,
          homeScore: null,
          awayScore: null,
          homePenaltyScore: null,
          awayPenaltyScore: null,
        },
        data: { schedulePlanId: created.id },
      })
      if (reserved.count !== dto.matchIds.length) throw this.matchAlreadyScheduled()
      return created
    })

    return this.toSchedulePlanView(plan)
  }

  async validateSchedulePlan(organizationId: string, schedulePlanId: string) {
    const plan = await this.requireSchedulePlan(organizationId, schedulePlanId)
    const matchCount = await this.prisma.match.count({
      where: {
        organizationId,
        schedulePlanId: plan.id,
      },
    })

    if (matchCount === 0) {
      throw new ApiHttpException(HttpStatus.CONFLICT, {
        code: ERROR_CODES.SCHEDULE_PLAN_EMPTY,
        message: '赛程草案没有可发布的比赛',
      })
    }

    return this.toSchedulePlanView(plan)
  }

  async publishSchedulePlan(
    organizationId: string,
    schedulePlanId: string,
    request: RequestWithId,
  ) {
    const requestId = getRequestId(request)
    const session = request.authenticatedSession
    if (!session || session.organizationId !== organizationId) {
      throw new ApiHttpException(HttpStatus.UNAUTHORIZED, {
        code: ERROR_CODES.UNAUTHORIZED,
        message: '赛程发布需要有效的登录会话',
      })
    }

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.schedulePlan.findFirst({
        where: {
          id: schedulePlanId,
          organizationId,
        },
        include: {
          tournament: true,
          matches: {
            include: MATCH_INCLUDE,
            orderBy: [{ scheduledStartAt: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      })

      if (plan === null) {
        throw this.notFound()
      }

      if (plan.status !== SchedulePlanStatus.DRAFT) {
        throw new ApiHttpException(HttpStatus.CONFLICT, {
          code: ERROR_CODES.SCHEDULE_PLAN_ALREADY_PUBLISHED,
          message: '赛程草案已发布，不能重复发布',
        })
      }

      if (plan.matches.length === 0) {
        throw new ApiHttpException(HttpStatus.CONFLICT, {
          code: ERROR_CODES.SCHEDULE_PLAN_EMPTY,
          message: '赛程草案没有可发布的比赛',
        })
      }

      const reserved = await tx.schedulePlan.updateMany({
        where: { id: plan.id, organizationId, status: SchedulePlanStatus.DRAFT },
        data: { status: SchedulePlanStatus.PUBLISHED },
      })
      if (reserved.count !== 1) {
        throw new ApiHttpException(HttpStatus.CONFLICT, {
          code: ERROR_CODES.SCHEDULE_PLAN_ALREADY_PUBLISHED,
          message: '赛程草案已发布，不能重复发布',
        })
      }

      const latestRevision = await tx.scheduleRevision.findFirst({
        orderBy: { version: 'desc' },
        select: { version: true },
        where: {
          schedulePlanId,
        },
      })
      const version = (latestRevision?.version ?? 0) + 1
      const snapshot = {
        matches: plan.matches.map((match) => this.toMatchView(match)),
        publishedBy: session.userId,
        requestId,
      }

      const revision = await tx.scheduleRevision.create({
        data: {
          organizationId,
          tournamentId: plan.tournamentId,
          schedulePlanId: plan.id,
          version,
          snapshot,
        },
      })

      const scheduled = await tx.match.updateMany({
        data: {
          scheduleRevisionId: revision.id,
          status: MatchStatus.SCHEDULED,
        },
        where: {
          organizationId,
          schedulePlanId: plan.id,
          status: MatchStatus.DRAFT,
          scheduleRevisionId: null,
          reportVersion: 0,
          confirmedReportVersion: null,
          homeScore: null,
          awayScore: null,
          homePenaltyScore: null,
          awayPenaltyScore: null,
        },
      })
      if (scheduled.count !== plan.matches.length) throw this.matchAlreadyScheduled()

      await tx.schedulePlan.update({
        data: {
          status: SchedulePlanStatus.PUBLISHED,
          publishedAt: revision.publishedAt,
        },
        where: { id: plan.id },
      })

      await tx.tournament.update({
        data: {
          status: TournamentStatus.PUBLISHED,
        },
        where: { id: plan.tournamentId },
      })

      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: AuditActorType.ADMIN,
          actorUserId: session.userId,
          actorRoleSnapshot: {
            roles: session.user.roles.map(({ role, scopeType, scopeId }) => ({
              role,
              scopeType,
              scopeId,
            })),
            source: 'AUTHENTICATED_SESSION',
          },
          action: 'SCHEDULE_PLAN_PUBLISHED',
          targetType: 'SchedulePlan',
          targetId: plan.id,
          afterSummary: {
            schedulePlanId: plan.id,
            scheduleRevisionId: revision.id,
            tournamentId: plan.tournamentId,
            version,
          },
          requestId,
          source: 'api',
        },
      })

      await tx.outboxJob.create({
        data: {
          organizationId,
          topic: 'schedule',
          aggregateType: 'SchedulePlan',
          aggregateId: plan.id,
          eventType: 'SchedulePlanPublished',
          payload: {
            schedulePlanId: plan.id,
            scheduleRevisionId: revision.id,
            tournamentId: plan.tournamentId,
            version,
          },
          deduplicationKey: `schedule-plan-published:${plan.id}:v${version}`,
          correlationId: requestId,
          status: OutboxJobStatus.PENDING,
        },
      })

      return this.toScheduleRevisionView(revision)
    })
  }

  async listPublicTournaments(
    organizationId: string,
    selection?: { competitionDefinitionId?: string | undefined; seasonId?: string | undefined },
  ) {
    validateTournamentSelection(selection)
    const tournaments = await this.prisma.tournament.findMany({
      include: { _count: { select: { scheduleRevisions: { where: { status: 'PUBLISHED' } } } } },
      orderBy: { createdAt: 'desc' },
      where: {
        organizationId,
        status: TournamentStatus.PUBLISHED,
        ...(selection?.competitionDefinitionId
          ? { competitionDefinitionId: selection.competitionDefinitionId }
          : {}),
        ...(selection?.seasonId ? { seasonId: selection.seasonId } : {}),
      },
    })

    return {
      items: tournaments.map((tournament) => ({
        ...this.toTournamentView(tournament),
        hasPublishedSchedule: tournament._count.scheduleRevisions > 0,
      })),
    }
  }

  async getPublicTournament(organizationId: string, tournamentId: string) {
    const tournament = await this.prisma.tournament.findFirst({
      include: {
        ruleVersions: {
          orderBy: { version: 'asc' },
        },
        season: true,
      },
      where: {
        id: tournamentId,
        organizationId,
        status: TournamentStatus.PUBLISHED,
      },
    })

    if (tournament === null) {
      throw this.notFound()
    }

    return {
      ...this.toTournamentView(tournament),
      season: this.toSeasonView(tournament.season),
      ruleVersions: tournament.ruleVersions.map((ruleVersion) =>
        this.toRuleVersionView(ruleVersion),
      ),
    }
  }

  async getPublicSchedule(organizationId: string, tournamentId: string) {
    const tournament = await this.prisma.tournament.findFirst({
      where: {
        id: tournamentId,
        organizationId,
        status: TournamentStatus.PUBLISHED,
      },
    })

    if (tournament === null) {
      throw this.notFound()
    }

    const revision = await this.prisma.scheduleRevision.findFirst({
      orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
      where: {
        tournamentId,
        organizationId,
      },
    })

    if (revision === null) {
      throw this.notFound()
    }

    const matches = await this.prisma.match.findMany({
      include: MATCH_INCLUDE,
      orderBy: [{ scheduledStartAt: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      where: {
        organizationId,
        scheduleRevisionId: revision.id,
      },
    })

    return {
      tournament: this.toTournamentView(tournament),
      revision: this.toScheduleRevisionView(revision),
      matches: matches.map((match) => this.toMatchView(match)),
    }
  }

  async getPublicMatch(organizationId: string, matchId: string) {
    const match = await this.prisma.match.findFirst({
      include: MATCH_INCLUDE,
      where: {
        id: matchId,
        organizationId,
        status: { not: MatchStatus.DRAFT },
        tournament: { organizationId, status: TournamentStatus.PUBLISHED },
        scheduleRevisionId: {
          not: null,
        },
      },
    })

    if (match === null) {
      throw this.notFound()
    }

    return this.toMatchView(match)
  }

  async getPublicTeam(organizationId: string, teamId: string) {
    const registration = await this.prisma.teamRegistration.findFirst({
      include: { team: true },
      where: {
        organizationId,
        status: TeamRegistrationStatus.APPROVED,
        teamId,
        tournament: {
          organizationId,
          status: TournamentStatus.PUBLISHED,
        },
      },
    })

    if (registration === null) {
      throw this.notFound()
    }

    return this.toTeamView(registration.team)
  }

  private async requireSeason(organizationId: string, seasonId: string) {
    const season = await this.prisma.season.findFirst({
      where: {
        id: seasonId,
        organizationId,
      },
    })

    if (season === null) {
      throw this.notFound()
    }

    return season
  }

  private async requireTournament(organizationId: string, tournamentId: string) {
    const tournament = await this.prisma.tournament.findFirst({
      where: {
        id: tournamentId,
        organizationId,
      },
    })

    if (tournament === null) {
      throw this.notFound()
    }

    return tournament
  }

  private async requireOptionalTeam(organizationId: string, teamId: string | undefined) {
    if (teamId === undefined) {
      return
    }

    const team = await this.prisma.team.findFirst({
      where: {
        id: teamId,
        organizationId,
      },
    })

    if (team === null) {
      throw this.notFound()
    }
  }

  private async requireOptionalVenue(organizationId: string, venueId: string | undefined) {
    if (venueId === undefined) {
      return
    }

    const venue = await this.prisma.venue.findFirst({
      where: {
        id: venueId,
        organizationId,
      },
    })

    if (venue === null) {
      throw this.notFound()
    }
  }

  private async requireMatches(organizationId: string, tournamentId: string, matchIds: string[]) {
    const matches = await this.prisma.match.findMany({
      select: { id: true },
      where: {
        id: { in: matchIds },
        organizationId,
        tournamentId,
      },
    })

    if (matches.length !== new Set(matchIds).size) {
      throw this.notFound()
    }
  }

  private async requireSchedulePlan(organizationId: string, schedulePlanId: string) {
    const plan = await this.prisma.schedulePlan.findFirst({
      where: {
        id: schedulePlanId,
        organizationId,
      },
    })

    if (plan === null) {
      throw this.notFound()
    }

    return plan
  }

  private matchAlreadyScheduled(): ApiHttpException {
    return new ApiHttpException(HttpStatus.CONFLICT, {
      code: ERROR_CODES.CONFLICT,
      message: '只能安排尚未加入草案、未发布且没有比分的比赛；既有赛程与结果不能覆盖',
    })
  }

  private notFound(): ApiHttpException {
    return new ApiHttpException(HttpStatus.NOT_FOUND, {
      code: ERROR_CODES.NOT_FOUND,
      message: '资源不存在',
    })
  }

  private toSeasonView(season: {
    id: string
    organizationId: string
    seasonCode: string
    name: string
    startsOn: Date | null
    endsOn: Date | null
  }) {
    return {
      id: season.id,
      organizationId: season.organizationId,
      seasonCode: season.seasonCode,
      name: season.name,
      startsOn: season.startsOn?.toISOString().slice(0, 10) ?? null,
      endsOn: season.endsOn?.toISOString().slice(0, 10) ?? null,
    }
  }

  private toTournamentView(tournament: {
    id: string
    organizationId: string
    seasonId: string
    tournamentCode: string
    name: string
    status: TournamentStatus
  }) {
    return {
      id: tournament.id,
      organizationId: tournament.organizationId,
      seasonId: tournament.seasonId,
      tournamentCode: tournament.tournamentCode,
      name: tournament.name,
      status: tournament.status,
    }
  }

  private toRuleVersionView(ruleVersion: {
    id: string
    organizationId: string
    tournamentId: string
    version: number
    name: string
    status: string
    rules: Prisma.JsonValue
    publishedAt: Date
  }) {
    return {
      id: ruleVersion.id,
      organizationId: ruleVersion.organizationId,
      tournamentId: ruleVersion.tournamentId,
      version: ruleVersion.version,
      name: ruleVersion.name,
      status: ruleVersion.status,
      rules:
        typeof ruleVersion.rules === 'object' && ruleVersion.rules !== null
          ? (ruleVersion.rules as Record<string, unknown>)
          : {},
      publishedAt: ruleVersion.publishedAt.toISOString(),
    }
  }

  private toTeamView(team: {
    id: string
    organizationId: string
    teamCode: string
    name: string
    shortName: string | null
  }) {
    return {
      id: team.id,
      organizationId: team.organizationId,
      teamCode: team.teamCode,
      name: team.name,
      shortName: team.shortName,
    }
  }

  private toVenueView(venue: {
    id: string
    organizationId: string
    venueCode: string
    name: string
    address: string | null
  }) {
    return {
      id: venue.id,
      organizationId: venue.organizationId,
      venueCode: venue.venueCode,
      name: venue.name,
      address: venue.address,
    }
  }

  private toMatchView(match: MatchWithRelations) {
    return {
      id: match.id,
      recorded: match.reportVersion > 0,
      organizationId: match.organizationId,
      tournamentId: match.tournamentId,
      matchCode: match.matchCode,
      title: match.title,
      status: match.status,
      scheduledStartAt: match.scheduledStartAt?.toISOString() ?? null,
      homeTeam:
        match.homeTeam === null
          ? null
          : {
              id: match.homeTeam.id,
              teamCode: match.homeTeam.teamCode,
              name: match.homeTeam.name,
              shortName: match.homeTeam.shortName,
            },
      awayTeam:
        match.awayTeam === null
          ? null
          : {
              id: match.awayTeam.id,
              teamCode: match.awayTeam.teamCode,
              name: match.awayTeam.name,
              shortName: match.awayTeam.shortName,
            },
      venue:
        match.venue === null
          ? null
          : {
              id: match.venue.id,
              venueCode: match.venue.venueCode,
              name: match.venue.name,
            },
    }
  }

  private toSchedulePlanView(plan: {
    id: string
    organizationId: string
    tournamentId: string
    name: string
    status: SchedulePlanStatus
    publishedAt: Date | null
  }) {
    return {
      id: plan.id,
      organizationId: plan.organizationId,
      tournamentId: plan.tournamentId,
      name: plan.name,
      status: plan.status,
      publishedAt: plan.publishedAt?.toISOString() ?? null,
    }
  }

  private toScheduleRevisionView(revision: {
    id: string
    organizationId: string
    tournamentId: string
    schedulePlanId: string
    version: number
    status: string
    publishedAt: Date
  }) {
    return {
      id: revision.id,
      organizationId: revision.organizationId,
      tournamentId: revision.tournamentId,
      schedulePlanId: revision.schedulePlanId,
      version: revision.version,
      status: revision.status,
      publishedAt: revision.publishedAt.toISOString(),
    }
  }
}
