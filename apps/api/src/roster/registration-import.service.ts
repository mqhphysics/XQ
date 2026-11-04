import { randomUUID } from 'node:crypto'

import { ERROR_CODES } from '@xiaoqiu/contracts'

import {
  AuditActorType,
  DataQualityStatus,
  ImportBatchStatus,
  OutboxJobStatus,
  Prisma,
  type PrismaClient,
  RosterSubmissionStatus,
  TeamRegistrationStatus,
} from '../generated/prisma/client'
import {
  RegistrationImportError,
  createPlayerIdentity,
  type ParsedRegistrationDocumentV1,
} from './registration-import.schema'

const IMPORT_TYPE = 'REGISTRATION_JSON_V1'
const MAX_SERIALIZABLE_ATTEMPTS = 3

export interface ImportRegistrationOptions {
  document: ParsedRegistrationDocumentV1
  sourceFileHash: string
  tournamentCode: string
  acknowledgeWarnings: boolean
  matchingSecret: string
}

export interface ImportRegistrationResult {
  batchId: string
  teamCode: string
  playerCount: number
  warningCount: number
  result: 'IMPORTED' | 'ALREADY_IMPORTED'
  registrationId: string
  rosterSnapshotId: string
  rosterSnapshotVersion: number
}

export class RegistrationImportService {
  constructor(private readonly prisma: PrismaClient) {}

  async import(options: ImportRegistrationOptions): Promise<ImportRegistrationResult> {
    if (!/^[a-f0-9]{64}$/.test(options.sourceFileHash)) {
      throw new RegistrationImportError(ERROR_CODES.REGISTRATION_IMPORT_INVALID, [
        'SOURCE_FILE_HASH_INVALID',
      ])
    }

    if (options.document.warningCodes.length > 0 && !options.acknowledgeWarnings) {
      throw new RegistrationImportError(
        ERROR_CODES.REGISTRATION_IMPORT_WARNINGS_NOT_ACKNOWLEDGED,
        options.document.warningCodes,
      )
    }

    const tournaments = await this.prisma.tournament.findMany({
      select: { id: true, organizationId: true },
      take: 2,
      where: { tournamentCode: options.tournamentCode },
    })

    if (tournaments.length === 0) {
      throw new RegistrationImportError(ERROR_CODES.NOT_FOUND)
    }

    if (tournaments.length > 1) {
      throw new RegistrationImportError(ERROR_CODES.REGISTRATION_IMPORT_TOURNAMENT_AMBIGUOUS)
    }

    const tournament = tournaments[0]

    if (tournament === undefined) {
      throw new RegistrationImportError(ERROR_CODES.NOT_FOUND)
    }

    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.importInTransaction(tx, tournament, options),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        )
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034') &&
          attempt < MAX_SERIALIZABLE_ATTEMPTS
        ) {
          continue
        }

        throw error
      }
    }

    throw new RegistrationImportError(ERROR_CODES.CONFLICT)
  }

  private async importInTransaction(
    tx: Prisma.TransactionClient,
    tournament: { id: string; organizationId: string },
    options: ImportRegistrationOptions,
  ): Promise<ImportRegistrationResult> {
    const organizationId = tournament.organizationId
    const existingBatch = await tx.importBatch.findUnique({
      include: {
        rosterSnapshot: true,
        teamRegistration: { include: { team: true } },
      },
      where: {
        organizationId_tournamentId_importType_sourceFileHash: {
          organizationId,
          tournamentId: tournament.id,
          importType: IMPORT_TYPE,
          sourceFileHash: options.sourceFileHash,
        },
      },
    })

    if (
      existingBatch?.status === ImportBatchStatus.SUCCEEDED &&
      existingBatch.teamRegistration !== null &&
      existingBatch.rosterSnapshot !== null
    ) {
      return {
        batchId: existingBatch.id,
        teamCode: existingBatch.teamRegistration.team.teamCode,
        playerCount: existingBatch.rowCount,
        warningCount: existingBatch.warningCodes.length,
        result: 'ALREADY_IMPORTED',
        registrationId: existingBatch.teamRegistration.id,
        rosterSnapshotId: existingBatch.rosterSnapshot.id,
        rosterSnapshotVersion: existingBatch.rosterSnapshot.snapshotVersion,
      }
    }

    const team = await tx.team.upsert({
      create: {
        organizationId,
        teamCode: options.document.team.teamCode,
        name: options.document.team.name,
        shortName: options.document.team.shortName,
      },
      update: {
        name: options.document.team.name,
        shortName: options.document.team.shortName,
      },
      where: {
        organizationId_teamCode: {
          organizationId,
          teamCode: options.document.team.teamCode,
        },
      },
    })
    const now = new Date()
    const registration = await tx.teamRegistration.upsert({
      create: {
        organizationId,
        tournamentId: tournament.id,
        teamId: team.id,
        status: TeamRegistrationStatus.APPROVED,
        leaderDisplayName: options.document.team.leaderDisplayName,
        coachDisplayName: options.document.team.coachDisplayName,
        contactName: options.document.team.contactName,
        contactPhone: options.document.team.contactPhone,
        approvedAt: now,
      },
      update: {
        status: TeamRegistrationStatus.APPROVED,
        leaderDisplayName: options.document.team.leaderDisplayName,
        coachDisplayName: options.document.team.coachDisplayName,
        contactName: options.document.team.contactName,
        contactPhone: options.document.team.contactPhone,
        approvedAt: now,
      },
      where: {
        tournamentId_teamId: {
          tournamentId: tournament.id,
          teamId: team.id,
        },
      },
    })
    const latestSubmission = await tx.rosterSubmission.findFirst({
      orderBy: { submissionVersion: 'desc' },
      select: { submissionVersion: true },
      where: { teamRegistrationId: registration.id },
    })
    const latestSnapshot = await tx.rosterSnapshot.findFirst({
      orderBy: { snapshotVersion: 'desc' },
      select: { snapshotVersion: true },
      where: {
        organizationId,
        teamId: team.id,
        tournamentId: tournament.id,
      },
    })
    const players = []

    for (const [index, importedPlayer] of options.document.players.entries()) {
      const identity = createPlayerIdentity(organizationId, importedPlayer, options.matchingSecret)
      const existingPlayer = await tx.playerProfile.findFirst({
        where: {
          organizationId,
          sourceType: identity.sourceType,
          sourceKey: identity.sourceKey,
        },
      })

      if (existingPlayer !== null) {
        const conflictingEntry = await tx.rosterEntry.findFirst({
          select: { id: true },
          where: {
            organizationId,
            playerProfileId: existingPlayer.id,
            rosterSubmission: {
              teamRegistration: {
                teamId: { not: team.id },
                tournamentId: tournament.id,
              },
            },
          },
        })

        if (conflictingEntry !== null) {
          throw new RegistrationImportError(ERROR_CODES.ROSTER_PLAYER_IDENTITY_CONFLICT)
        }
      }

      const playerProfile =
        existingPlayer === null
          ? await tx.playerProfile.create({
              data: {
                organizationId,
                sourceType: identity.sourceType,
                sourceKey: identity.sourceKey,
                displayName: importedPlayer.displayName,
                studentIdMasked: importedPlayer.studentIdMasked,
              },
            })
          : await tx.playerProfile.update({
              data: {
                displayName: importedPlayer.displayName,
                ...(importedPlayer.studentIdMasked === null
                  ? {}
                  : { studentIdMasked: importedPlayer.studentIdMasked }),
              },
              where: { id: existingPlayer.id },
            })

      players.push({
        playerProfile,
        shirtNumber: importedPlayer.shirtNumber,
        sortOrder: index,
      })
    }

    const submissionVersion = (latestSubmission?.submissionVersion ?? 0) + 1
    const snapshotVersion = (latestSnapshot?.snapshotVersion ?? 0) + 1
    const dataQualityStatus =
      options.document.warningCodes.length === 0
        ? DataQualityStatus.CLEAN
        : DataQualityStatus.WARNING
    const submission = await tx.rosterSubmission.create({
      data: {
        organizationId,
        teamRegistrationId: registration.id,
        submissionVersion,
        status: RosterSubmissionStatus.LOCKED,
        dataQualityStatus,
        warningCodes: options.document.warningCodes,
        sourceFileHash: options.sourceFileHash,
        submittedAt: now,
        approvedAt: now,
        lockedAt: now,
      },
    })

    await tx.rosterEntry.createMany({
      data: players.map((player) => ({
        organizationId,
        rosterSubmissionId: submission.id,
        playerProfileId: player.playerProfile.id,
        shirtNumber: player.shirtNumber,
        sortOrder: player.sortOrder,
      })),
    })

    const snapshot = await tx.rosterSnapshot.create({
      data: {
        organizationId,
        tournamentId: tournament.id,
        teamId: team.id,
        teamRegistrationId: registration.id,
        rosterSubmissionId: submission.id,
        snapshotVersion,
        sourceFileHash: options.sourceFileHash,
      },
    })

    await tx.rosterSnapshotEntry.createMany({
      data: players.map((player) => ({
        organizationId,
        rosterSnapshotId: snapshot.id,
        playerProfileId: player.playerProfile.id,
        displayName: player.playerProfile.displayName,
        shirtNumber: player.shirtNumber,
        studentIdMasked: player.playerProfile.studentIdMasked,
        sortOrder: player.sortOrder,
      })),
    })

    await tx.rosterSnapshot.update({
      data: { lockedAt: now },
      where: { id: snapshot.id },
    })

    const batchId = randomUUID()
    const batch = await tx.importBatch.create({
      data: {
        id: batchId,
        organizationId,
        tournamentId: tournament.id,
        teamRegistrationId: registration.id,
        rosterSnapshotId: snapshot.id,
        importType: IMPORT_TYPE,
        schemaVersion: options.document.schemaVersion,
        sourceFileHash: options.sourceFileHash,
        status: ImportBatchStatus.SUCCEEDED,
        teamCode: team.teamCode,
        rowCount: players.length,
        warningCodes: options.document.warningCodes,
        confirmedAt: now,
      },
    })

    await tx.auditLog.create({
      data: {
        organizationId,
        actorType: AuditActorType.IMPORT_BATCH,
        actorRoleSnapshot: { source: 'DEVELOPMENT_REGISTRATION_IMPORT' },
        action: 'ROSTER_SNAPSHOT_IMPORTED_AND_LOCKED',
        targetType: 'RosterSnapshot',
        targetId: snapshot.id,
        afterSummary: {
          importBatchId: batch.id,
          playerCount: players.length,
          registrationId: registration.id,
          rosterSnapshotVersion: snapshot.snapshotVersion,
          teamCode: team.teamCode,
          tournamentId: tournament.id,
          warningCount: options.document.warningCodes.length,
        },
        requestId: `registration-import:${batch.id}`,
        correlationId: batch.id,
        source: 'registration-import-cli',
      },
    })

    await tx.outboxJob.create({
      data: {
        organizationId,
        topic: 'roster',
        aggregateType: 'RosterSnapshot',
        aggregateId: snapshot.id,
        eventType: 'RosterSnapshotLocked',
        payload: {
          importBatchId: batch.id,
          playerCount: players.length,
          registrationId: registration.id,
          rosterSnapshotId: snapshot.id,
          rosterSnapshotVersion: snapshot.snapshotVersion,
          teamId: team.id,
          tournamentId: tournament.id,
        },
        deduplicationKey: `roster-snapshot-locked:${snapshot.id}`,
        correlationId: batch.id,
        status: OutboxJobStatus.PENDING,
      },
    })

    return {
      batchId: batch.id,
      teamCode: team.teamCode,
      playerCount: players.length,
      warningCount: options.document.warningCodes.length,
      result: 'IMPORTED',
      registrationId: registration.id,
      rosterSnapshotId: snapshot.id,
      rosterSnapshotVersion: snapshot.snapshotVersion,
    }
  }
}
