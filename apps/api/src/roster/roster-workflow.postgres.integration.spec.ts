import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { configureApp } from '../app.setup'
import { AuthModule } from '../auth/auth.module'
import { hashPassword } from '../auth/password'
import { DatabaseModule } from '../database/database.module'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient, type Role, type RoleScopeType } from '../generated/prisma/client'
import { RosterModule } from './roster.module'
import { SocialModule } from '../social/social.module'

const databaseUrl = process.env.TEST_DATABASE_URL
const fixturePassword = 'RosterFixture2026!'

test('roster HTTP workflow: real roles, isolation, immutable revisions, retries and transaction rollback', async () => {
  assert.ok(
    databaseUrl,
    'TEST_DATABASE_URL is required; this acceptance never silently skips PostgreSQL',
  )
  const parsed = new URL(databaseUrl)
  assert.match(
    parsed.pathname,
    /^\/roster_v2_test(?:_[a-z0-9]+)?$/,
    'Use the dedicated disposable roster test database',
  )
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  const suffix = randomUUID().slice(0, 8)
  const organization = await prisma.organization.create({
    data: { slug: `roster-v2-${suffix}`, name: 'DEMO_FIXTURE 名单验收组织' },
  })
  const otherOrganization = await prisma.organization.create({
    data: { slug: `roster-v2-other-${suffix}`, name: 'DEMO_FIXTURE 另一组织' },
  })
  const season = await prisma.season.create({
    data: {
      organizationId: organization.id,
      seasonCode: `DEMO-${suffix}`,
      name: 'DEMO_FIXTURE 验收赛季',
    },
  })
  const tournament = await prisma.tournament.create({
    data: {
      organizationId: organization.id,
      seasonId: season.id,
      tournamentCode: `DEMO-${suffix}`,
      name: 'DEMO_FIXTURE 排阵验收赛事',
      status: 'PUBLISHED',
    },
  })
  const team = await prisma.team.create({
    data: {
      organizationId: organization.id,
      teamCode: `DEMO-TEAM-${suffix}`,
      name: 'DEMO_FIXTURE 青禾队',
      shortName: '青禾队',
      primaryColor: '#306c52',
    },
  })
  const otherTeam = await prisma.team.create({
    data: {
      organizationId: organization.id,
      teamCode: `DEMO-OTHER-${suffix}`,
      name: 'DEMO_FIXTURE 别队',
    },
  })
  const registration = await prisma.teamRegistration.create({
    data: { organizationId: organization.id, tournamentId: tournament.id, teamId: team.id },
  })
  await prisma.teamRegistration.create({
    data: { organizationId: organization.id, tournamentId: tournament.id, teamId: otherTeam.id },
  })
  const players = await Promise.all(
    Array.from({ length: 14 }, (_, index) =>
      prisma.playerProfile.create({
        data: {
          organizationId: organization.id,
          displayName: `示例队员${index + 1}`,
          sourceType: 'DEMO_FIXTURE',
          sourceKey: `roster-v2-${suffix}-${index}`,
          position:
            index === 0
              ? 'GOALKEEPER'
              : index < 5
                ? 'DEFENDER'
                : index < 10
                  ? 'MIDFIELDER'
                  : 'FORWARD',
        },
      }),
    ),
  )
  await prisma.teamMembership.createMany({
    data: players.map((player) => ({
      organizationId: organization.id,
      teamId: team.id,
      playerProfileId: player.id,
    })),
  })
  const policy = {
    minPlayers: 2,
    maxPlayers: 18,
    submissionDeadline: '2099-01-01T00:00:00Z',
    eligiblePlayerIds: players.map((player) => player.id),
  }
  const rules = await prisma.competitionRuleVersion.create({
    data: {
      organizationId: organization.id,
      tournamentId: tournament.id,
      version: 1,
      name: 'DEMO_FIXTURE 名单规程',
      rules: { roster: policy },
    },
  })
  const createUser = async (
    name: string,
    orgId: string,
    role?: { role: Role; scopeType: RoleScopeType; scopeId: string },
  ) => {
    const digest = hashPassword(fixturePassword)
    const user = await prisma.user.create({
      data: {
        displayName: `DEMO_FIXTURE ${name}`,
        loginNameNormalized: `${name}-${suffix}`,
        passwordCredential: { create: { passwordHash: digest.hash, passwordSalt: digest.salt } },
        memberships: { create: { organizationId: orgId, status: 'ACTIVE' } },
        ...(role ? { roleAssignments: { create: { organizationId: orgId, ...role } } } : {}),
      },
    })
    return { id: user.id, username: `${name}-${suffix}`, orgId }
  }
  const captain = await createUser('captain', organization.id, {
    role: 'TEAM_CAPTAIN',
    scopeType: 'TEAM',
    scopeId: team.id,
  })
  const admin = await createUser('admin', organization.id, {
    role: 'TOURNAMENT_ADMIN',
    scopeType: 'TOURNAMENT',
    scopeId: tournament.id,
  })
  const student = await createUser('student', organization.id)
  const foreignAdmin = await createUser('foreign', otherOrganization.id, {
    role: 'ORGANIZATION_ADMIN',
    scopeType: 'ORGANIZATION',
    scopeId: otherOrganization.id,
  })
  const wrongScope = await createUser('wrong-scope', organization.id, {
    role: 'TOURNAMENT_ADMIN',
    scopeType: 'TOURNAMENT',
    scopeId: randomUUID(),
  })
  const module = await Test.createTestingModule({
    imports: [DatabaseModule, AuthModule, SocialModule, RosterModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile()
  const app = module.createNestApplication({ logger: false })
  configureApp(app)
  await app.init()
  const server = app.getHttpServer()
  const path = `/api/roster/tournaments/${tournament.id}/teams/${team.id}`
  const login = async (user: Awaited<ReturnType<typeof createUser>>) => {
    const result = await request(server)
      .post('/api/auth/login')
      .set('x-dev-organization-id', user.orgId)
      .send({ username: user.username, password: fixturePassword })
      .expect(200)
    return `Bearer ${result.body.accessToken}`
  }
  try {
    const [captainToken, adminToken, studentToken, foreignToken, wrongToken] = await Promise.all([
      login(captain),
      login(admin),
      login(student),
      login(foreignAdmin),
      login(wrongScope),
    ])
    const command = (
      token: string,
      action: string,
      expectedVersion: number,
      extras: Record<string, unknown> = {},
      key = randomUUID(),
    ) =>
      request(server)
        .post(`${path}/commands`)
        .set('Authorization', token)
        .set('Idempotency-Key', key)
        .send({ action, expectedVersion, ...extras })
    const roster = players.map((player, index) => ({
      playerId: player.id,
      shirtNumber: String(index + 1),
    }))
    await request(server).get(path).set('x-dev-role', 'TOURNAMENT_ADMIN').expect(401)
    await request(server)
      .get(path)
      .set('Authorization', studentToken)
      .set('x-dev-role', 'TOURNAMENT_ADMIN')
      .expect(403)
    await request(server).get(path).set('Authorization', wrongToken).expect(403)
    await request(server).get(path).set('Authorization', foreignToken).expect(404)
    await request(server)
      .get(`/api/roster/tournaments/${tournament.id}/teams/${otherTeam.id}`)
      .set('Authorization', captainToken)
      .expect(403)
    const initial = await request(server).get(path).set('Authorization', captainToken).expect(200)
    assert.equal(initial.body.version, 0)
    assert.equal(initial.body.availablePlayers.length, 14)
    const originalKey = randomUUID()
    const retries = await Promise.all([
      command(captainToken, 'SAVE', 0, { players: roster }, originalKey),
      command(captainToken, 'SAVE', 0, { players: roster }, originalKey),
    ])
    assert.deepEqual(
      retries.map((result) => result.status),
      [200, 200],
    )
    assert.deepEqual(retries[0]!.body, retries[1]!.body)
    assert.equal(
      await prisma.rosterSubmission.count({ where: { teamRegistrationId: registration.id } }),
      1,
    )
    assert.equal(await prisma.outboxJob.count({ where: { aggregateId: registration.id } }), 1)
    await command(captainToken, 'SAVE', 0, { players: roster.slice(0, 2) }, originalKey).expect(409)
    await command(captainToken, 'SAVE', 0, { players: roster }).expect(409)
    await command(captainToken, 'SUBMIT', 1, { players: [roster[0]] }).expect(400)
    await command(captainToken, 'SUBMIT', 1, { players: [roster[0], roster[0]] }).expect(400)
    await command(captainToken, 'SUBMIT', 1, {
      players: roster.map((entry) => ({ ...entry, shirtNumber: '1' })),
    }).expect(400)
    await command(captainToken, 'SUBMIT', 1, {
      players: [{ playerId: randomUUID(), shirtNumber: '1' }, roster[1]],
    }).expect(400)
    await command(captainToken, 'LOCK', 1).expect(403)
    const races = await Promise.all([
      command(captainToken, 'SUBMIT', 1, { players: roster }),
      command(captainToken, 'SAVE', 1, { players: roster }),
    ])
    assert.deepEqual(races.map((result) => result.status).sort(), [200, 409])
    let current = (await request(server).get(path).set('Authorization', captainToken).expect(200))
      .body
    if (current.status === 'DRAFT')
      current = (
        await command(captainToken, 'SUBMIT', current.version, { players: roster }).expect(200)
      ).body
    const inbox = await request(server)
      .get('/api/me/notifications')
      .set('Authorization', adminToken)
      .expect(200)
    assert.equal(
      inbox.body.items.filter((item: { type: string }) => item.type === 'ROSTER_SUBMITTED').length,
      1,
    )
    assert.equal(
      await prisma.userNotification.count({ where: { recipientUserId: wrongScope.id } }),
      0,
    )
    assert.equal(
      await prisma.userNotification.count({ where: { recipientUserId: foreignAdmin.id } }),
      0,
    )
    await command(captainToken, 'SAVE', current.version, { players: roster }).expect(409)
    await command(adminToken, 'RETURN', current.version).expect(400)
    current = (
      await command(adminToken, 'RETURN', current.version, {
        reason: 'DEMO_FIXTURE 请核对球衣号码',
      }).expect(200)
    ).body
    assert.match(current.decisionReason, /核对/)
    const captainInbox = await request(server)
      .get('/api/me/notifications')
      .set('Authorization', captainToken)
      .expect(200)
    assert.ok(
      captainInbox.body.items.some(
        (item: { type: string; body: string }) =>
          item.type === 'ROSTER_UPDATED' && item.body.includes('核对球衣号码'),
      ),
    )
    current = (
      await command(captainToken, 'SUBMIT', current.version, { players: roster }).expect(200)
    ).body
    await prisma.competitionRuleVersion.create({
      data: {
        organizationId: organization.id,
        tournamentId: tournament.id,
        version: 2,
        name: 'FICTIONAL_TEST revised roster policy',
        rules: { roster: { ...policy, maxPlayers: 19 } },
      },
    })
    await command(adminToken, 'APPROVE', current.version).expect(409)
    current = (
      await command(adminToken, 'RETURN', current.version, {
        reason: 'DEMO_FIXTURE 规程改变需重新确认',
      }).expect(200)
    ).body
    current = (
      await command(captainToken, 'SUBMIT', current.version, { players: roster }).expect(200)
    ).body
    current = (await command(adminToken, 'APPROVE', current.version).expect(200)).body
    current = (await command(adminToken, 'LOCK', current.version).expect(200)).body
    const firstSnapshot = await prisma.rosterSnapshot.findUniqueOrThrow({
      where: { id: current.lockedSnapshot.id },
      include: { entries: true },
    })
    await command(captainToken, 'SAVE', current.version, { players: roster }).expect(409)
    current = (
      await command(adminToken, 'REOPEN', current.version, {
        reason: 'DEMO_FIXTURE 批准补报一名新球员',
      }).expect(200)
    ).body
    await prisma.competitionRuleVersion.create({
      data: {
        organizationId: organization.id,
        tournamentId: tournament.id,
        version: 3,
        name: 'FICTIONAL_TEST expired initial deadline',
        rules: { roster: { ...policy, submissionDeadline: '2000-01-01T00:00:00Z' } },
      },
    })
    current = (
      await command(captainToken, 'SAVE', current.version, { players: roster.slice(0, 13) }).expect(
        200,
      )
    ).body
    current = (
      await command(captainToken, 'SUBMIT', current.version, {
        players: roster.slice(0, 13),
      }).expect(200)
    ).body
    current = (await command(adminToken, 'APPROVE', current.version).expect(200)).body
    current = (await command(adminToken, 'LOCK', current.version).expect(200)).body
    assert.equal(current.lockedSnapshot.version, 2)
    assert.deepEqual(
      await prisma.rosterSnapshot.findUniqueOrThrow({
        where: { id: firstSnapshot.id },
        include: { entries: true },
      }),
      firstSnapshot,
    )
    // PostgreSQL trigger forces an actual outbox insert failure. All earlier writes must roll back.
    const before = await prisma.rosterSubmission.count({
      where: { teamRegistrationId: registration.id },
    })
    const notificationsBefore = await prisma.userNotification.count({
      where: { organizationId: organization.id },
    })
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION roster_v2_reject_outbox_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.aggregate_id = '${registration.id}' THEN RAISE EXCEPTION 'DEMO_FIXTURE outbox unavailable'; END IF; RETURN NEW; END $$`,
    )
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER roster_v2_outbox_${suffix} BEFORE INSERT ON outbox_jobs FOR EACH ROW EXECUTE FUNCTION roster_v2_reject_outbox_${suffix}()`,
    )
    try {
      await command(adminToken, 'REOPEN', current.version, {
        reason: 'DEMO_FIXTURE 事务回滚验证',
      }).expect(500)
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER roster_v2_outbox_${suffix} ON outbox_jobs`)
      await prisma.$executeRawUnsafe(`DROP FUNCTION roster_v2_reject_outbox_${suffix}()`)
    }
    assert.equal(
      await prisma.rosterSubmission.count({ where: { teamRegistrationId: registration.id } }),
      before,
    )
    assert.equal(
      await prisma.auditLog.count({
        where: { organizationId: organization.id, source: 'roster-workflow' },
      }),
      before,
    )
    assert.equal(await prisma.outboxJob.count({ where: { aggregateId: registration.id } }), before)
    assert.equal(
      await prisma.userNotification.count({ where: { organizationId: organization.id } }),
      notificationsBefore,
    )
    // Two approved teams race to lock the same qualified player IDs.
    const shared = await Promise.all(
      [1, 2].map((index) =>
        prisma.playerProfile.create({
          data: {
            organizationId: organization.id,
            displayName: `DEMO_FIXTURE 同名并发球员${index}`,
            sourceType: 'DEMO_FIXTURE',
            sourceKey: `shared-${suffix}-${index}`,
          },
        }),
      ),
    )
    await prisma.teamMembership.createMany({
      data: [team.id, otherTeam.id].flatMap((teamId) =>
        shared.map((player) => ({
          organizationId: organization.id,
          teamId,
          playerProfileId: player.id,
        })),
      ),
    })
    await prisma.competitionRuleVersion.create({
      data: {
        organizationId: organization.id,
        tournamentId: tournament.id,
        version: 4,
        name: 'FICTIONAL_TEST supplemental eligible players',
        rules: {
          roster: {
            ...policy,
            eligiblePlayerIds: [...policy.eligiblePlayerIds, ...shared.map((player) => player.id)],
          },
        },
      },
    })
    assert.deepEqual(
      (await prisma.competitionRuleVersion.findUniqueOrThrow({ where: { id: rules.id } })).rules,
      { roster: policy },
    )
    const sharedRoster = shared.map((player, index) => ({
      playerId: player.id,
      shirtNumber: String(index + 30),
    }))
    current = (
      await command(adminToken, 'REOPEN', current.version, {
        reason: 'DEMO_FIXTURE 跨队并发锁定验收',
      }).expect(200)
    ).body
    current = (
      await command(captainToken, 'SUBMIT', current.version, { players: sharedRoster }).expect(200)
    ).body
    current = (await command(adminToken, 'APPROVE', current.version).expect(200)).body
    const otherPath = `/api/roster/tournaments/${tournament.id}/teams/${otherTeam.id}`
    const otherCommand = (
      action: string,
      expectedVersion: number,
      extras: Record<string, unknown> = {},
    ) =>
      request(server)
        .post(`${otherPath}/commands`)
        .set('Authorization', adminToken)
        .set('Idempotency-Key', randomUUID())
        .send({ action, expectedVersion, ...extras })
    await otherCommand('SUBMIT', 0, { players: sharedRoster }).expect(200)
    await otherCommand('APPROVE', 1).expect(200)
    const locks = await Promise.all([
      command(adminToken, 'LOCK', current.version),
      otherCommand('LOCK', 2),
    ])
    assert.deepEqual(locks.map((result) => result.status).sort(), [200, 409])
    assert.equal(
      await prisma.rosterSnapshot.count({
        where: { organizationId: organization.id, tournamentId: tournament.id },
      }),
      3,
    )
    await prisma.roleAssignment.updateMany({
      where: { userId: captain.id },
      data: { revokedAt: new Date() },
    })
    await request(server).get(path).set('Authorization', captainToken).expect(403)
    await prisma.userSession.updateMany({
      where: { userId: admin.id },
      data: { expiresAt: new Date(0) },
    })
    await request(server).get(path).set('Authorization', adminToken).expect(401)
    assert.equal(JSON.stringify(initial.body).includes('studentId'), false)
    assert.equal(
      await prisma.playerProfile.count({ where: { organizationId: organization.id } }),
      16,
    )
    // Keep fictional fixtures in the disposable DB; locked records must not be deleted in-place.
  } finally {
    await app.close()
    await prisma.$disconnect()
  }
})
