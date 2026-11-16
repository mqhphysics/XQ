import { HttpException, Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { centerError } from '../admin-center/admin-center.policy'
import { CampusCommandService } from './campus-command.service'
import type { CampusReasonDto, CreateCupDto } from './campus.dto'
import { selectPublicTournament } from '../common/public-tournament'

@Injectable()
export class CompetitionCatalogService {
  constructor(
    @Inject(PrismaService) readonly prisma: PrismaService,
    @Inject(CampusCommandService) readonly command: CampusCommandService,
  ) {}
  async catalog(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!organization) throw centerError(404, '组织不存在')
    const [competitions, seasons, tournaments, featured] = await Promise.all([
      this.prisma.competitionDefinition.findMany({
        where: { organizationId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.season.findMany({
        where: { organizationId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.tournament.findMany({
        where: {
          organizationId,
          competitionDefinitionId: { not: null },
          status: 'PUBLISHED',
          OR: [
            { scheduleRevisions: { some: { status: 'PUBLISHED' } } },
            { teamRegistrations: { some: { status: 'APPROVED' } } },
          ],
        },
        select: {
          id: true,
          seasonId: true,
          competitionDefinitionId: true,
          name: true,
          status: true,
          _count: { select: { matches: true, teamRegistrations: true } },
        },
      }),
      selectPublicTournament(this.prisma, organizationId).catch((error: unknown) => {
        if (error instanceof HttpException && error.getStatus() === 404) return null
        throw error
      }),
    ])
    return { competitions, seasons, tournaments, defaultTournamentId: featured?.id ?? null }
  }
  admin(auth: string | undefined) {
    return this.command.read(auth, false, async (tx, actor) => {
      const organizationAdmin = this.command.policy.isOrganizationAdministrator(actor)
      const managedIds = actor.user.roles
        .filter((role) => role.role === 'TOURNAMENT_ADMIN' && role.scopeType === 'TOURNAMENT')
        .map((role) => role.scopeId)
      if (!organizationAdmin && !managedIds.length) throw centerError(403, '需要赛事管理权限')
      const scoped = organizationAdmin
        ? null
        : await tx.tournament.findMany({
            where: { organizationId: actor.organizationId, id: { in: managedIds } },
            select: { id: true, seasonId: true, competitionDefinitionId: true },
          })
      if (scoped && !scoped.length) throw centerError(403, '当前没有可管理的赛事')
      const [competitions, seasons, tournaments] = await Promise.all([
        tx.competitionDefinition.findMany({
          where: {
            organizationId: actor.organizationId,
            ...(scoped
              ? {
                  id: {
                    in: scoped
                      .map((item) => item.competitionDefinitionId)
                      .filter((id): id is string => !!id),
                  },
                }
              : {}),
          },
          orderBy: { sortOrder: 'asc' },
        }),
        tx.season.findMany({
          where: {
            organizationId: actor.organizationId,
            ...(scoped ? { id: { in: scoped.map((item) => item.seasonId) } } : {}),
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        }),
        tx.tournament.findMany({
          where: {
            organizationId: actor.organizationId,
            competitionDefinitionId: { not: null },
            ...(scoped ? { id: { in: scoped.map((item) => item.id) } } : {}),
          },
          include: { _count: { select: { matches: true, teamRegistrations: true } } },
        }),
      ])
      const featured = [...tournaments]
        .filter((t) => t.status === 'PUBLISHED' && t.featuredAt)
        .sort((a, b) => b.featuredAt!.getTime() - a.featuredAt!.getTime())[0]
      return { competitions, seasons, tournaments, defaultTournamentId: featured?.id ?? null }
    })
  }

  createCup(
    auth: string | undefined,
    body: CreateCupDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(auth, 'campus:cup:create', body, key, true, async (tx, actor) => {
      const season = await tx.season.findFirst({
        where: { id: body.seasonId, organizationId: actor.organizationId, isDemo: false },
      })
      if (!season) throw centerError(404, '正式赛季不存在')
      const cupName = body.cupName.trim()
      if (!cupName) throw centerError(400, '请填写杯赛名称')
      const name = `${cupName}${body.gender === 'MALE' ? '（男足）' : body.gender === 'FEMALE' ? '（女足）' : ''}`
      const competition = await tx.competitionDefinition.upsert({
        where: { organizationId_code: { organizationId: actor.organizationId, code: body.code } },
        create: {
          organizationId: actor.organizationId,
          code: body.code,
          cupName,
          name,
          gender: body.gender,
        },
        update: {},
      })
      if (competition.cupName !== cupName || competition.gender !== body.gender)
        throw centerError(409, '赛事代码已用于其他杯赛或组别')
      const existing = await tx.tournament.findUnique({
        where: {
          competitionDefinitionId_seasonId: {
            competitionDefinitionId: competition.id,
            seasonId: season.id,
          },
        },
      })
      if (existing) return existing
      const tournament = await tx.tournament.create({
        data: {
          organizationId: actor.organizationId,
          competitionDefinitionId: competition.id,
          seasonId: season.id,
          tournamentCode: `${competition.code}-${season.seasonCode}`.slice(0, 64),
          name: `${name} · ${season.name}`,
          status: 'DRAFT',
        },
      })
      await this.command.audit(
        tx,
        actor,
        'COMPETITION_SEASON_CREATED',
        'Tournament',
        tournament.id,
        body.reason,
        requestId,
        null,
        { competitionId: competition.id, seasonId: season.id, status: 'DRAFT' },
      )
      return tournament
    })
  }

  feature(
    auth: string | undefined,
    tournamentId: string,
    body: CampusReasonDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(
      auth,
      `campus:cup:feature:${tournamentId}`,
      body,
      key,
      true,
      async (tx, actor) => {
        const selected = await tx.tournament.findFirst({
          where: {
            id: tournamentId,
            organizationId: actor.organizationId,
            status: 'PUBLISHED',
            season: { isDemo: false },
          },
        })
        if (!selected) throw centerError(409, '请先发布正式赛事的赛程')
        await tx.tournament.updateMany({
          where: { organizationId: actor.organizationId, featuredAt: { not: null } },
          data: { featuredAt: null },
        })
        await tx.tournament.update({ where: { id: selected.id }, data: { featuredAt: new Date() } })
        await this.command.audit(
          tx,
          actor,
          'COMPETITION_FEATURED',
          'Tournament',
          selected.id,
          body.reason,
          requestId,
          null,
          { tournamentId },
        )
        return { defaultTournamentId: selected.id }
      },
    )
  }
  createInstance(
    auth: string | undefined,
    competitionId: string,
    seasonId: string,
    body: CampusReasonDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(
      auth,
      `campus:competition:${competitionId}:${seasonId}`,
      body,
      key,
      true,
      async (tx, actor) => {
        const [competition, season] = await Promise.all([
          tx.competitionDefinition.findFirst({
            where: { id: competitionId, organizationId: actor.organizationId },
          }),
          tx.season.findFirst({ where: { id: seasonId, organizationId: actor.organizationId } }),
        ])
        if (!competition || !season) throw centerError(404, '赛事或赛季不属于当前组织')
        const existing = await tx.tournament.findUnique({
          where: {
            competitionDefinitionId_seasonId: {
              competitionDefinitionId: competition.id,
              seasonId: season.id,
            },
          },
        })
        if (existing) return existing
        const instance = await tx.tournament.create({
          data: {
            organizationId: actor.organizationId,
            competitionDefinitionId: competition.id,
            seasonId: season.id,
            tournamentCode: `${competition.code}-${season.seasonCode}`.slice(0, 64),
            name: `${competition.name} · ${season.name}`,
            status: 'DRAFT',
          },
        })
        await this.command.audit(
          tx,
          actor,
          'COMPETITION_SEASON_CREATED',
          'Tournament',
          instance.id,
          body.reason,
          requestId,
          null,
          { competitionId, seasonId, status: instance.status },
        )
        return instance
      },
    )
  }
}
