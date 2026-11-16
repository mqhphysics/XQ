import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { isUUID } from 'class-validator'

import type { PrismaService } from '../database/prisma.service'
import type { Prisma } from '../generated/prisma/client'
import { ApiHttpException } from './api-http.exception'
export function validateTournamentSelection(selection?: {
  competitionDefinitionId?: string | undefined
  seasonId?: string | undefined
}) {
  for (const value of [selection?.competitionDefinitionId, selection?.seasonId])
    if (value !== undefined && !isUUID(value))
      throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
        code: ERROR_CODES.BAD_REQUEST,
        message: '赛事与赛季必须使用有效编号',
      })
  return selection
}

/** Explicit links stay scoped; the homepage prefers the organization administrator's choice. */
export async function selectPublicTournament(
  prisma: Pick<PrismaService, 'tournament'>,
  organizationId: string,
  tournamentId?: string,
  selection?: { competitionDefinitionId?: string | undefined; seasonId?: string | undefined },
) {
  validateTournamentSelection(selection)
  const configured =
    tournamentId === undefined && !selection
      ? process.env.DEFAULT_TOURNAMENT_ID?.trim() || undefined
      : undefined
  const selectedId = tournamentId ?? configured
  if (selectedId !== undefined && !isUUID(selectedId)) {
    throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
      code: ERROR_CODES.BAD_REQUEST,
      message: '赛事选择必须是单个 UUID',
    })
  }
  const eligible: Prisma.TournamentWhereInput = {
    organizationId,
    ...(selection?.competitionDefinitionId
      ? { competitionDefinitionId: selection.competitionDefinitionId }
      : {}),
    ...(selection?.seasonId ? { seasonId: selection.seasonId } : {}),
    ...(tournamentId ? { id: tournamentId } : {}),
    status: 'PUBLISHED',
    organization: { status: 'ACTIVE' },
    season: { organizationId },
  }
  const query = {
    include: { season: true, competitionDefinition: true },
    orderBy: [
      ...(!tournamentId && !selection
        ? [{ featuredAt: { sort: 'desc' as const, nulls: 'last' as const } }]
        : []),
      { season: { startsOn: { sort: 'desc', nulls: 'last' } } },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
  } satisfies Prisma.TournamentFindFirstArgs
  const tournament =
    (configured
      ? await prisma.tournament.findFirst({
          ...query,
          where: { ...eligible, OR: [{ id: configured }, { featuredAt: { not: null } }] },
        })
      : null) ?? (await prisma.tournament.findFirst({ ...query, where: eligible }))
  if (!tournament)
    throw new ApiHttpException(HttpStatus.NOT_FOUND, {
      code: ERROR_CODES.NOT_FOUND,
      message: '当前组织没有可读取的已发布赛事',
    })
  return tournament
}
