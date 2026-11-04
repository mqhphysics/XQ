import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import {
  RosterSubmissionStatus,
  TeamRegistrationStatus,
  TournamentStatus,
  type Prisma,
} from '../generated/prisma/client'

const REGISTRATION_REVIEW_INCLUDE = {
  importBatches: {
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
  rosterSnapshots: {
    include: {
      entries: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: { snapshotVersion: 'desc' },
    take: 1,
    where: { lockedAt: { not: null } },
  },
  rosterSubmissions: {
    include: {
      entries: {
        include: { playerProfile: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: { submissionVersion: 'desc' },
    take: 1,
  },
  team: true,
} satisfies Prisma.TeamRegistrationInclude

type RegistrationReview = Prisma.TeamRegistrationGetPayload<{
  include: typeof REGISTRATION_REVIEW_INCLUDE
}>

@Injectable()
export class RosterService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listPublicTournamentTeams(organizationId: string, tournamentId: string) {
    await this.requireTournament(organizationId, tournamentId, TournamentStatus.PUBLISHED)

    const registrations = await this.prisma.teamRegistration.findMany({
      include: {
        rosterSnapshots: {
          include: {
            entries: true,
          },
          orderBy: { snapshotVersion: 'desc' },
          take: 1,
          where: { lockedAt: { not: null } },
        },
        team: true,
      },
      orderBy: [{ team: { name: 'asc' } }, { createdAt: 'asc' }],
      where: {
        organizationId,
        rosterSnapshots: { some: { lockedAt: { not: null } } },
        status: TeamRegistrationStatus.APPROVED,
        tournamentId,
      },
    })

    return {
      items: registrations.flatMap((registration) => {
        const snapshot = registration.rosterSnapshots[0]

        return snapshot === undefined
          ? []
          : [
              {
                id: registration.team.id,
                tournamentId,
                teamCode: registration.team.teamCode,
                name: registration.team.name,
                shortName: registration.team.shortName,
                registrationStatus: registration.status,
                rosterStatus: RosterSubmissionStatus.LOCKED,
                rosterPlayerCount: snapshot.entries.length,
              },
            ]
      }),
    }
  }

  async getPublicTournamentTeam(organizationId: string, tournamentId: string, teamId: string) {
    await this.requireTournament(organizationId, tournamentId, TournamentStatus.PUBLISHED)

    const registration = await this.prisma.teamRegistration.findFirst({
      include: {
        rosterSnapshots: {
          include: {
            entries: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
          orderBy: { snapshotVersion: 'desc' },
          take: 1,
          where: { lockedAt: { not: null } },
        },
        team: true,
      },
      where: {
        organizationId,
        rosterSnapshots: { some: { lockedAt: { not: null } } },
        status: TeamRegistrationStatus.APPROVED,
        teamId,
        tournamentId,
      },
    })

    const snapshot = registration?.rosterSnapshots[0]

    if (registration === null || registration === undefined || snapshot === undefined) {
      throw this.notFound()
    }

    return {
      id: registration.team.id,
      tournamentId,
      teamCode: registration.team.teamCode,
      name: registration.team.name,
      shortName: registration.team.shortName,
      registrationStatus: registration.status,
      rosterStatus: RosterSubmissionStatus.LOCKED,
      rosterPlayerCount: snapshot.entries.length,
      leaderDisplayName: registration.leaderDisplayName,
      coachDisplayName: registration.coachDisplayName,
      rosterSnapshotVersion: snapshot.snapshotVersion,
      players: snapshot.entries.map((entry) => ({
        id: entry.playerProfileId,
        displayName: entry.displayName,
        shirtNumber: entry.shirtNumber,
      })),
    }
  }

  async listAdminTeamRegistrations(organizationId: string, tournamentId: string) {
    await this.requireTournament(organizationId, tournamentId)

    const registrations = await this.prisma.teamRegistration.findMany({
      include: REGISTRATION_REVIEW_INCLUDE,
      orderBy: [{ team: { name: 'asc' } }, { createdAt: 'asc' }],
      where: {
        organizationId,
        tournamentId,
      },
    })

    return {
      items: registrations.map((registration) => this.toAdminListItem(registration)),
    }
  }

  async getAdminTeamRegistration(
    organizationId: string,
    tournamentId: string,
    registrationId: string,
  ) {
    await this.requireTournament(organizationId, tournamentId)

    const registration = await this.prisma.teamRegistration.findFirst({
      include: REGISTRATION_REVIEW_INCLUDE,
      where: {
        id: registrationId,
        organizationId,
        tournamentId,
      },
    })

    if (registration === null) {
      throw this.notFound()
    }

    const snapshot = registration.rosterSnapshots[0]
    const submission = registration.rosterSubmissions[0]
    const importBatch = registration.importBatches[0]
    const players =
      submission?.entries.map((entry) => ({
        id: entry.playerProfileId,
        displayName: entry.playerProfile.displayName,
        shirtNumber: entry.shirtNumber,
        studentIdMasked: entry.playerProfile.studentIdMasked,
      })) ??
      snapshot?.entries.map((entry) => ({
        id: entry.playerProfileId,
        displayName: entry.displayName,
        shirtNumber: entry.shirtNumber,
        studentIdMasked: entry.studentIdMasked,
      })) ??
      []

    return {
      ...this.toAdminListItem(registration),
      leaderDisplayName: registration.leaderDisplayName,
      coachDisplayName: registration.coachDisplayName,
      importBatchId: importBatch?.id ?? null,
      importedAt: importBatch?.confirmedAt?.toISOString() ?? null,
      players,
    }
  }

  private async requireTournament(
    organizationId: string,
    tournamentId: string,
    status?: TournamentStatus,
  ) {
    const tournament = await this.prisma.tournament.findFirst({
      select: { id: true },
      where: {
        id: tournamentId,
        organizationId,
        ...(status === undefined ? {} : { status }),
      },
    })

    if (tournament === null) {
      throw this.notFound()
    }

    return tournament
  }

  private toAdminListItem(registration: RegistrationReview) {
    const submission = registration.rosterSubmissions[0]
    const snapshot = registration.rosterSnapshots[0]

    return {
      registrationId: registration.id,
      teamId: registration.team.id,
      teamCode: registration.team.teamCode,
      teamName: registration.team.name,
      registrationStatus: registration.status,
      rosterStatus: submission?.status ?? null,
      rosterSubmissionVersion: submission?.submissionVersion ?? null,
      rosterSnapshotVersion: snapshot?.snapshotVersion ?? null,
      playerCount: submission?.entries.length ?? snapshot?.entries.length ?? 0,
      dataQualityStatus: submission?.dataQualityStatus ?? null,
      warningCodes: submission?.warningCodes ?? [],
      contactName: registration.contactName,
      contactPhoneMasked: maskPhone(registration.contactPhone),
    }
  }

  private notFound(): ApiHttpException {
    return new ApiHttpException(HttpStatus.NOT_FOUND, {
      code: ERROR_CODES.NOT_FOUND,
      message: '资源不存在',
    })
  }
}

export function maskPhone(value: string | null): string | null {
  if (value === null || value.trim() === '') {
    return null
  }

  const normalized = value.replace(/\s+/g, '')

  if (normalized.length < 7) {
    return '*'.repeat(normalized.length)
  }

  return `${normalized.slice(0, 3)}${'*'.repeat(normalized.length - 7)}${normalized.slice(-4)}`
}
