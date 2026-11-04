import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { centerError } from '../admin-center/admin-center.policy'
import { CampusCommandService } from './campus-command.service'
import type { CampusReasonDto } from './campus.dto'

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
    const [competitions, seasons, tournaments] = await Promise.all([
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
    ])
    return { competitions, seasons, tournaments }
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
      return { competitions, seasons, tournaments }
    })
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
