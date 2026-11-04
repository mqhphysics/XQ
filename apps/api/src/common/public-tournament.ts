import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { isUUID } from 'class-validator'

import type { PrismaService } from '../database/prisma.service'
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

/** Selection is explicit, deployment configured, then newest published season. */
export async function selectPublicTournament(
  prisma: Pick<PrismaService, 'tournament'>,
  organizationId: string,
  tournamentId?: string,
  selection?: { competitionDefinitionId?: string | undefined; seasonId?: string | undefined },
) {
  validateTournamentSelection(selection)
  const selectedId =
    tournamentId ?? (selection ? undefined : process.env.DEFAULT_TOURNAMENT_ID?.trim() || undefined)
  if (selectedId !== undefined && !isUUID(selectedId)) {
    throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
      code: ERROR_CODES.BAD_REQUEST,
      message: '赛事选择必须是单个 UUID',
    })
  }
  const tournament = await prisma.tournament.findFirst({
    where: {
      organizationId,
      ...(selection?.competitionDefinitionId
        ? { competitionDefinitionId: selection.competitionDefinitionId }
        : {}),
      ...(selection?.seasonId ? { seasonId: selection.seasonId } : {}),
      ...(selectedId ? { id: selectedId } : {}),
      status: 'PUBLISHED',
      organization: { status: 'ACTIVE' },
      season: { organizationId },
    },
    include: { season: true },
    orderBy: [
      { season: { startsOn: { sort: 'desc', nulls: 'last' } } },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
  })
  if (!tournament)
    throw new ApiHttpException(HttpStatus.NOT_FOUND, {
      code: ERROR_CODES.NOT_FOUND,
      message: '当前组织没有可读取的已发布赛事',
    })
  return tournament
}
