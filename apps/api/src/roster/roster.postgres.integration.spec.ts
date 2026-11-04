import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import request from 'supertest'

import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { hashPassword } from '../auth/password'
import { PrismaService } from '../database/prisma.service'
import {
  Prisma,
  PrismaClient,
  TeamRegistrationStatus,
  TournamentStatus,
} from '../generated/prisma/client'
import {
  RegistrationImportError,
  hashRegistrationSource,
  parseRegistrationImportDocument,
} from './registration-import.schema'
import { RegistrationImportService } from './registration-import.service'

const databaseUrl = process.env.TEST_DATABASE_URL
const MATCHING_SECRET = 'fictional-postgres-test-secret-2026'

test('PostgreSQL roster import is idempotent, transactional and privacy scoped', async () => {
  assert.ok(databaseUrl)

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  })
  let app: INestApplication | undefined
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const organization = await prisma.organization.create({
    data: {
      slug: `roster-test-${suffix}`,
      name: '虚构名单测试组织',
    },
  })
  const otherOrganization = await prisma.organization.create({
    data: {
      slug: `roster-other-${suffix}`,
      name: '虚构其他组织',
    },
  })
  const season = await prisma.season.create({
    data: {
      organizationId: organization.id,
      seasonCode: `FAKE-${suffix}`,
      name: '虚构测试赛季',
    },
  })
  const publishedTournament = await prisma.tournament.create({
    data: {
      organizationId: organization.id,
      seasonId: season.id,
      tournamentCode: `FAKE-PUBLISHED-${suffix}`,
      name: '虚构已发布赛事',
      status: TournamentStatus.PUBLISHED,
    },
  })
  const draftTournament = await prisma.tournament.create({
    data: {
      organizationId: organization.id,
      seasonId: season.id,
      tournamentCode: `FAKE-DRAFT-${suffix}`,
      name: '虚构未发布赛事',
      status: TournamentStatus.DRAFT,
    },
  })
  const importer = new RegistrationImportService(prisma)
  const firstInput = createFixture(`FAKE-TEAM-A-${suffix}`, [
    ['虚构球员甲', 'FAKE-STUDENT-0001', '01'],
    ['虚构球员乙', 'FAKE-STUDENT-0002', '10'],
  ])
  const firstSource = Buffer.from(JSON.stringify(firstInput))
  const firstDocument = parseRegistrationImportDocument(firstInput)

  try {
    const firstResult = await importer.import({
      document: firstDocument,
      sourceFileHash: hashRegistrationSource(firstSource),
      tournamentCode: publishedTournament.tournamentCode,
      acknowledgeWarnings: false,
      matchingSecret: MATCHING_SECRET,
    })
    const repeatedResult = await importer.import({
      document: firstDocument,
      sourceFileHash: hashRegistrationSource(firstSource),
      tournamentCode: publishedTournament.tournamentCode,
      acknowledgeWarnings: false,
      matchingSecret: MATCHING_SECRET,
    })

    assert.equal(firstResult.result, 'IMPORTED')
    assert.equal(repeatedResult.result, 'ALREADY_IMPORTED')
    assert.equal(repeatedResult.batchId, firstResult.batchId)
    assert.equal(
      await prisma.team.count({
        where: { organizationId: organization.id, teamCode: firstResult.teamCode },
      }),
      1,
    )
    assert.equal(
      await prisma.rosterSubmission.count({
        where: { teamRegistrationId: firstResult.registrationId },
      }),
      1,
    )
    assert.equal(
      await prisma.rosterSnapshot.count({
        where: { teamRegistrationId: firstResult.registrationId },
      }),
      1,
    )

    const concurrentInput = createFixture(`FAKE-CONCURRENT-${suffix}`, [
      ['虚构并发球员', 'FAKE-CONCURRENT-0001', '18'],
    ])
    const concurrentSource = Buffer.from(JSON.stringify(concurrentInput))
    const concurrentOptions = {
      document: parseRegistrationImportDocument(concurrentInput),
      sourceFileHash: hashRegistrationSource(concurrentSource),
      tournamentCode: publishedTournament.tournamentCode,
      acknowledgeWarnings: false,
      matchingSecret: MATCHING_SECRET,
    }
    const concurrentResults = await Promise.all([
      importer.import(concurrentOptions),
      importer.import(concurrentOptions),
    ])

    assert.deepEqual(concurrentResults.map((result) => result.result).sort(), [
      'ALREADY_IMPORTED',
      'IMPORTED',
    ])
    assert.equal(concurrentResults[0]?.batchId, concurrentResults[1]?.batchId)

    const warningInput = createFixture(`FAKE-WARNING-${suffix}`, [
      ['虚构告警球员甲', 'FAKE-WARNING-0001', '08'],
      ['虚构告警球员乙', 'FAKE-WARNING-0002', '08'],
    ])
    const warningSource = Buffer.from(JSON.stringify(warningInput))

    await assert.rejects(
      importer.import({
        document: parseRegistrationImportDocument(warningInput),
        sourceFileHash: hashRegistrationSource(warningSource),
        tournamentCode: publishedTournament.tournamentCode,
        acknowledgeWarnings: false,
        matchingSecret: MATCHING_SECRET,
      }),
      (error: unknown) =>
        error instanceof RegistrationImportError &&
        error.code === ERROR_CODES.REGISTRATION_IMPORT_WARNINGS_NOT_ACKNOWLEDGED,
    )

    const conflictingInput = createFixture(`FAKE-TEAM-B-${suffix}`, [
      ['虚构冲突球员', 'FAKE-STUDENT-0001', '12'],
      ['虚构新增球员', 'FAKE-STUDENT-0099', '13'],
    ])
    const conflictingSource = Buffer.from(JSON.stringify(conflictingInput))
    const batchCountBeforeConflict = await prisma.importBatch.count({
      where: { organizationId: organization.id },
    })

    await assert.rejects(
      importer.import({
        document: parseRegistrationImportDocument(conflictingInput),
        sourceFileHash: hashRegistrationSource(conflictingSource),
        tournamentCode: publishedTournament.tournamentCode,
        acknowledgeWarnings: false,
        matchingSecret: MATCHING_SECRET,
      }),
      (error: unknown) =>
        error instanceof RegistrationImportError &&
        error.code === ERROR_CODES.ROSTER_PLAYER_IDENTITY_CONFLICT,
    )
    assert.equal(
      await prisma.team.count({
        where: {
          organizationId: organization.id,
          teamCode: conflictingInput.team.teamCode,
        },
      }),
      0,
    )
    assert.equal(
      await prisma.importBatch.count({ where: { organizationId: organization.id } }),
      batchCountBeforeConflict,
    )

    const draftInput = createFixture(`FAKE-DRAFT-TEAM-${suffix}`, [
      ['虚构草案球员', 'FAKE-DRAFT-0001', '06'],
    ])
    const draftSource = Buffer.from(JSON.stringify(draftInput))
    const draftResult = await importer.import({
      document: parseRegistrationImportDocument(draftInput),
      sourceFileHash: hashRegistrationSource(draftSource),
      tournamentCode: draftTournament.tournamentCode,
      acknowledgeWarnings: false,
      matchingSecret: MATCHING_SECRET,
    })
    const hiddenInput = createFixture(`FAKE-HIDDEN-TEAM-${suffix}`, [
      ['虚构待审球员', 'FAKE-HIDDEN-0001', '16'],
    ])
    const hiddenSource = Buffer.from(JSON.stringify(hiddenInput))
    const hiddenResult = await importer.import({
      document: parseRegistrationImportDocument(hiddenInput),
      sourceFileHash: hashRegistrationSource(hiddenSource),
      tournamentCode: publishedTournament.tournamentCode,
      acknowledgeWarnings: false,
      matchingSecret: MATCHING_SECRET,
    })

    await prisma.teamRegistration.update({
      data: { status: TeamRegistrationStatus.SUBMITTED },
      where: { id: hiddenResult.registrationId },
    })

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()

    const loginAdmin = async (orgId: string, username: string) => {
      const digest = hashPassword('RosterFixture2026!')
      await prisma.user.create({
        data: {
          displayName: `DEMO_FIXTURE ${username}`,
          loginNameNormalized: username,
          passwordCredential: { create: { passwordHash: digest.hash, passwordSalt: digest.salt } },
          memberships: { create: { organizationId: orgId, status: 'ACTIVE' } },
          roleAssignments: {
            create: {
              organizationId: orgId,
              role: 'ORGANIZATION_ADMIN',
              scopeType: 'ORGANIZATION',
              scopeId: orgId,
            },
          },
        },
      })
      const login = await request(app!.getHttpServer())
        .post('/api/auth/login')
        .set('x-dev-organization-id', orgId)
        .send({ username, password: 'RosterFixture2026!' })
        .expect(200)
      return { Authorization: `Bearer ${login.body.accessToken}` }
    }
    const adminHeaders = await loginAdmin(organization.id, `roster-admin-${suffix}`)
    const publicHeaders = { ...adminHeaders, 'x-dev-organization-id': organization.id }
    const foreignAdminHeaders = await loginAdmin(otherOrganization.id, `roster-foreign-${suffix}`)
    await request(app.getHttpServer())
      .get(`/api/admin/tournaments/${publishedTournament.id}/team-registrations`)
      .set({ 'x-dev-organization-id': organization.id, 'x-dev-role': 'TOURNAMENT_ADMIN' })
      .expect(401)
    const publicList = await request(app.getHttpServer())
      .get(`/api/public/tournaments/${publishedTournament.id}/teams`)
      .set(publicHeaders)
      .expect(200)

    assert.equal(publicList.body.items.length, 2)
    const firstPublicTeam = publicList.body.items.find(
      (item: { teamCode: string }) => item.teamCode === firstResult.teamCode,
    )
    assert.ok(firstPublicTeam)
    assert.equal(firstPublicTeam.rosterPlayerCount, 2)

    const firstRegistration = await prisma.teamRegistration.findUniqueOrThrow({
      include: { team: true },
      where: { id: firstResult.registrationId },
    })
    const publicDetail = await request(app.getHttpServer())
      .get(`/api/public/tournaments/${publishedTournament.id}/teams/${firstRegistration.team.id}`)
      .set(publicHeaders)
      .expect(200)
    const publicPayload = JSON.stringify(publicDetail.body)

    assert.equal(publicDetail.body.players[0].shirtNumber, '01')
    assert.equal(publicPayload.includes('FAKE-STUDENT-0001'), false)
    assert.equal(publicPayload.includes('13900000001'), false)
    assert.equal(publicPayload.includes('studentIdMasked'), false)
    assert.equal(publicPayload.includes('contactPhone'), false)
    assert.equal(publicPayload.includes('sourceFileHash'), false)

    await request(app.getHttpServer())
      .get(`/api/public/teams/${firstRegistration.team.id}`)
      .set(publicHeaders)
      .expect(200)
    const draftRegistration = await prisma.teamRegistration.findUniqueOrThrow({
      include: { team: true },
      where: { id: draftResult.registrationId },
    })

    await request(app.getHttpServer())
      .get(`/api/public/teams/${draftRegistration.team.id}`)
      .set(publicHeaders)
      .expect(404)
    await request(app.getHttpServer())
      .get(`/api/public/tournaments/${draftTournament.id}/teams`)
      .set(publicHeaders)
      .expect(404)

    const adminList = await request(app.getHttpServer())
      .get(`/api/admin/tournaments/${publishedTournament.id}/team-registrations`)
      .set(adminHeaders)
      .expect(200)
    assert.equal(adminList.body.items.length, 3)

    const adminDetail = await request(app.getHttpServer())
      .get(
        `/api/admin/tournaments/${publishedTournament.id}/team-registrations/${firstResult.registrationId}`,
      )
      .set(adminHeaders)
      .expect(200)
    const adminPayload = JSON.stringify(adminDetail.body)

    assert.equal(adminDetail.body.contactPhoneMasked, '139****0001')
    assert.equal(adminDetail.body.players[0].studentIdMasked, 'FA********01')
    assert.equal(adminPayload.includes('FAKE-STUDENT-0001'), false)
    assert.equal(adminPayload.includes('13900000001'), false)

    await request(app.getHttpServer())
      .get(
        `/api/admin/tournaments/${publishedTournament.id}/team-registrations/${firstResult.registrationId}`,
      )
      .set(foreignAdminHeaders)
      .expect(404)

    const openapi = await request(app.getHttpServer()).get('/api/openapi.json').expect(200)

    for (const path of [
      '/api/public/tournaments/{tournamentId}/teams',
      '/api/public/tournaments/{tournamentId}/teams/{teamId}',
      '/api/admin/tournaments/{tournamentId}/team-registrations',
      '/api/admin/tournaments/{tournamentId}/team-registrations/{registrationId}',
    ]) {
      assert.ok(openapi.body.paths[path], `${path} missing from OpenAPI`)
    }

    await assert.rejects(
      prisma.teamRegistration.create({
        data: {
          organizationId: organization.id,
          tournamentId: publishedTournament.id,
          teamId: firstRegistration.team.id,
        },
      }),
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',
    )

    const snapshotEntry = await prisma.rosterSnapshotEntry.findFirstOrThrow({
      where: { rosterSnapshotId: firstResult.rosterSnapshotId },
    })
    const lockedSnapshot = await prisma.rosterSnapshot.findUniqueOrThrow({
      where: { id: firstResult.rosterSnapshotId },
    })

    assert.ok(lockedSnapshot.lockedAt)

    await assert.rejects(
      prisma.rosterSnapshotEntry.update({
        data: { shirtNumber: '99' },
        where: { id: snapshotEntry.id },
      }),
    )

    const extraProfile = await prisma.playerProfile.create({
      data: {
        organizationId: organization.id,
        sourceType: 'FICTIONAL_TEST',
        sourceKey: randomUUID().replaceAll('-', '').repeat(2),
        displayName: '虚构追加球员',
      },
    })

    await assert.rejects(
      prisma.rosterSnapshotEntry.create({
        data: {
          organizationId: organization.id,
          rosterSnapshotId: firstResult.rosterSnapshotId,
          playerProfileId: extraProfile.id,
          displayName: extraProfile.displayName,
          shirtNumber: '99',
          sortOrder: 99,
        },
      }),
    )

    const importedProfiles = await prisma.playerProfile.findMany({
      where: { organizationId: organization.id },
    })
    assert.ok(importedProfiles.every((profile) => profile.sourceKey?.length === 64))
    assert.ok(
      importedProfiles.every(
        (profile) => profile.sourceKey !== 'FAKE-STUDENT-0001' && profile.sourceKey !== null,
      ),
    )

    const importAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        organizationId: organization.id,
        targetId: firstResult.rosterSnapshotId,
      },
    })
    const auditPayload = JSON.stringify(importAudit)
    assert.equal(auditPayload.includes('FAKE-STUDENT-0001'), false)
    assert.equal(auditPayload.includes('13900000001'), false)
  } finally {
    await app?.close()
    await prisma.$disconnect()
  }
})

function createFixture(
  teamCode: string,
  players: Array<[displayName: string, studentId: string, shirtNumber: string]>,
) {
  return {
    schemaVersion: 1,
    team: {
      teamCode,
      name: `虚构球队 ${teamCode}`,
      shortName: '虚构队',
      leaderDisplayName: '虚构领队甲',
      coachDisplayName: '虚构教练甲',
      contactName: '虚构联系人甲',
      contactPhone: '13900000001',
    },
    players: players.map(([displayName, studentId, shirtNumber]) => ({
      displayName,
      studentId,
      shirtNumber,
    })),
  }
}
