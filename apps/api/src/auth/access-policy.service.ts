import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { isUUID } from 'class-validator'

import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import type { AuthenticatedSession } from './auth.service'

/** Call with the session freshly returned by AuthService.requireSession. */
@Injectable()
export class AccessPolicyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  isOrganizationAdministrator(session: AuthenticatedSession): boolean {
    return session.user.roles.some(
      (role) =>
        (role.role === 'PLATFORM_ADMIN' && role.scopeType === 'PLATFORM') ||
        (role.role === 'ORGANIZATION_ADMIN' &&
          role.scopeType === 'ORGANIZATION' &&
          role.scopeId.toLowerCase() === session.organizationId),
    )
  }

  requireOrganizationAdministrator(session: AuthenticatedSession): void {
    if (!this.isOrganizationAdministrator(session)) throw forbidden()
  }

  async administeredTournamentIds(session: AuthenticatedSession): Promise<string[] | null> {
    if (this.isOrganizationAdministrator(session)) return null
    const ids = session.user.roles
      .filter((role) => role.role === 'TOURNAMENT_ADMIN' && role.scopeType === 'TOURNAMENT')
      .map((role) => role.scopeId)
      .filter((id) => isUUID(id))
    const tournaments = await this.prisma.tournament.findMany({
      where: { organizationId: session.organizationId, id: { in: ids } },
      select: { id: true },
    })
    if (!tournaments.length) throw forbidden()
    return tournaments.map(({ id }) => id)
  }

  async requireTournamentAdministrator(session: AuthenticatedSession, tournamentId: string) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id: objectId(tournamentId), organizationId: session.organizationId },
      select: { id: true },
    })
    if (!tournament) throw notFound()
    if (
      !this.isOrganizationAdministrator(session) &&
      !session.user.roles.some(
        (role) =>
          role.role === 'TOURNAMENT_ADMIN' &&
          role.scopeType === 'TOURNAMENT' &&
          role.scopeId.toLowerCase() === tournament.id,
      )
    )
      throw forbidden()
  }

  async requireTeamCaptain(session: AuthenticatedSession, teamId: string, tournamentId?: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: objectId(teamId), organizationId: session.organizationId },
      select: { id: true },
    })
    if (!team) throw notFound()
    if (tournamentId !== undefined) {
      const registration = await this.prisma.teamRegistration.findFirst({
        where: {
          organizationId: session.organizationId,
          tournamentId: objectId(tournamentId),
          teamId: team.id,
        },
        select: { id: true },
      })
      if (!registration) throw notFound()
    }
    if (
      !this.isOrganizationAdministrator(session) &&
      !session.user.roles.some(
        (role) =>
          (role.role === 'TEAM_CAPTAIN' || role.role === 'TEAM_COACH') &&
          role.scopeType === 'TEAM' &&
          role.scopeId.toLowerCase() === team.id,
      )
    )
      throw forbidden()
  }

  async requireMatchReporter(session: AuthenticatedSession, matchId: string) {
    const match = await this.prisma.match.findFirst({
      where: { id: objectId(matchId), organizationId: session.organizationId },
      select: { id: true, tournamentId: true },
    })
    if (!match) throw notFound()
    if (
      !this.isOrganizationAdministrator(session) &&
      !session.user.roles.some(
        (role) =>
          (role.role === 'MATCH_REPORTER' &&
            role.scopeType === 'MATCH' &&
            role.scopeId.toLowerCase() === match.id) ||
          (role.role === 'MATCH_REPORTER' &&
            role.scopeType === 'TOURNAMENT' &&
            role.scopeId.toLowerCase() === match.tournamentId) ||
          (role.role === 'TOURNAMENT_ADMIN' &&
            role.scopeType === 'TOURNAMENT' &&
            role.scopeId.toLowerCase() === match.tournamentId),
      )
    )
      throw forbidden()
  }
}

function forbidden() {
  return new ApiHttpException(HttpStatus.FORBIDDEN, {
    code: ERROR_CODES.FORBIDDEN,
    message: '当前账号没有此范围的操作权限',
  })
}

function objectId(value: string): string {
  if (!isUUID(value))
    throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
      code: ERROR_CODES.BAD_REQUEST,
      message: '对象编号必须是 UUID',
    })
  return value.toLowerCase()
}

function notFound() {
  return new ApiHttpException(HttpStatus.NOT_FOUND, {
    code: ERROR_CODES.NOT_FOUND,
    message: '当前组织中不存在该对象',
  })
}
