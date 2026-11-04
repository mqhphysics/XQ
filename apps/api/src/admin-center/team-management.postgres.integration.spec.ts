import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { configureApp } from '../app.setup'
import { hashPassword } from '../auth/password'
import { PrismaService } from '../database/prisma.service'
import { ExperienceModule } from '../experience/experience.module'
import { PrismaClient } from '../generated/prisma/client'
import { AdminCenterModule } from './admin-center.module'

function disposableDatabase() {
  const value = process.env.TEST_DATABASE_URL
  assert.ok(value, 'Team management regression requires a disposable TEST_DATABASE_URL')
  const parsed = new URL(value)
  assert.match(decodeURIComponent(parsed.pathname.slice(1)), /(?:^|_)(?:test|ci)(?:_|$)/)
  if (process.env.DATABASE_URL) assert.notEqual(value, process.env.DATABASE_URL)
  return value
}

async function fixture() {
  const prisma = new PrismaClient({ datasources: { db: { url: disposableDatabase() } } })
  const suffix = randomUUID().slice(0, 8)
  const password = 'FICTIONAL-Team-Management-2026!'
  const digest = hashPassword(password)
  const org = await prisma.organization.create({
    data: { slug: `team-management-${suffix}`, name: 'FICTIONAL_TEST Team Organization' },
  })
  const other = await prisma.organization.create({
    data: { slug: `team-management-other-${suffix}`, name: 'FICTIONAL_TEST Other Organization' },
  })
  async function user(label: string, organizationId = org.id) {
    return prisma.user.create({
      data: {
        loginNameNormalized: `team-management-${suffix}-${label}`,
        displayName: `FICTIONAL_TEST ${label}`,
        memberships: { create: { organizationId, status: 'ACTIVE' } },
        passwordCredential: {
          create: {
            passwordHash: digest.hash,
            passwordSalt: digest.salt,
            algorithm: digest.algorithm,
          },
        },
      },
    })
  }
  const admin = await user('admin')
  const captain = await user('captain')
  const student = await user('student')
  const crossCaptain = await user('cross-captain')
  const otherAdmin = await user('other-admin', other.id)
  await prisma.roleAssignment.createMany({
    data: [
      {
        organizationId: org.id,
        userId: admin.id,
        role: 'ORGANIZATION_ADMIN',
        scopeType: 'ORGANIZATION',
        scopeId: org.id,
      },
      {
        organizationId: other.id,
        userId: otherAdmin.id,
        role: 'ORGANIZATION_ADMIN',
        scopeType: 'ORGANIZATION',
        scopeId: other.id,
      },
    ],
  })
  const otherTeam = await prisma.team.create({
    data: {
      organizationId: other.id,
      teamCode: `OTHER-${suffix}`,
      name: 'FICTIONAL_TEST Other Team',
    },
  })
  const crossTeam = await prisma.team.create({
    data: {
      organizationId: org.id,
      teamCode: `CROSS-${suffix}`,
      name: 'FICTIONAL_TEST Different Team',
    },
  })
  await prisma.roleAssignment.create({
    data: {
      organizationId: org.id,
      userId: crossCaptain.id,
      role: 'TEAM_CAPTAIN',
      scopeType: 'TEAM',
      scopeId: crossTeam.id,
    },
  })
  const season = await prisma.season.create({
    data: { organizationId: org.id, seasonCode: suffix, name: 'FICTIONAL_TEST Season' },
  })
  const tournament = await prisma.tournament.create({
    data: {
      organizationId: org.id,
      seasonId: season.id,
      tournamentCode: suffix,
      name: 'FICTIONAL_TEST Published Tournament',
      status: 'PUBLISHED',
    },
  })
  await prisma.competitionRuleVersion.create({
    data: {
      organizationId: org.id,
      tournamentId: tournament.id,
      version: 1,
      status: 'PUBLISHED',
      name: 'FICTIONAL_TEST Results Rules',
      rules: {
        results: {
          points: { win: 3, draw: 1, loss: 0 },
          tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR', 'HEAD_TO_HEAD'],
          headToHead: {
            criteria: ['POINTS', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
            reapplyToRemainingTeams: true,
          },
          groupShootout: 'REJECT',
          knockoutShootout: 'ALLOWED',
          forfeit: { winnerGoals: 3, loserGoals: 0, loserPoints: 0, both: null },
        },
      },
    },
  })
  const module = await Test.createTestingModule({ imports: [AdminCenterModule, ExperienceModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile()
  const app = module.createNestApplication()
  configureApp(app)
  await app.init()
  const http = request(app.getHttpServer())
  async function login(username: string, organizationId = org.id) {
    const result = await http
      .post('/api/auth/login')
      .set('x-organization-id', organizationId)
      .send({ username, password })
      .expect(200)
    return `Bearer ${result.body.accessToken as string}`
  }
  const auth = await login(admin.loginNameNormalized!)
  const captainAuth = await login(captain.loginNameNormalized!)
  const studentAuth = await login(student.loginNameNormalized!)
  const crossAuth = await login(crossCaptain.loginNameNormalized!)
  const otherAuth = await login(otherAdmin.loginNameNormalized!, other.id)
  const reason = 'FICTIONAL_TEST documented team management'
  const createTeam = (body: object, key = randomUUID(), authorization = auth) =>
    http
      .post('/api/admin/center/teams')
      .set('authorization', authorization)
      .set('idempotency-key', key)
      .send(body)
  const createPlayer = (body: object, key = randomUUID(), authorization = auth) =>
    http
      .post('/api/admin/center/players')
      .set('authorization', authorization)
      .set('idempotency-key', key)
      .send(body)
  return {
    prisma,
    app,
    http,
    org,
    other,
    suffix,
    captain,
    otherTeam,
    tournament,
    auth,
    captainAuth,
    studentAuth,
    crossAuth,
    otherAuth,
    reason,
    createTeam,
    createPlayer,
  }
}

test(
  'team management writes: creation, captain refresh, authorization, CAS and idempotency',
  { timeout: 90000 },
  async (t) => {
    const f = await fixture()
    const { prisma, http, auth, reason } = f
    try {
      const teamBody = {
        teamCode: `NEW-${f.suffix}`,
        profile: {
          name: `FICTIONAL_TEST Club ${f.suffix}`,
          description: 'Club description',
          primaryColor: '#123456',
        },
        reason,
      }
      const teamKey = randomUUID()
      const created = await f.createTeam(teamBody, teamKey).expect(200)
      const teamId = created.body.id as string
      await prisma.roleAssignment.create({
        data: {
          organizationId: f.org.id,
          userId: f.captain.id,
          role: 'TEAM_CAPTAIN',
          scopeType: 'TEAM',
          scopeId: teamId,
        },
      })
      const workspace = () =>
        http.get(`/api/captain/teams/${teamId}`).set('authorization', f.captainAuth).expect(200)
      const profilePath = `/api/captain/teams/${teamId}/profile`
      const profilePut = (body: object, key = randomUUID(), authorization = f.captainAuth) =>
        http
          .put(profilePath)
          .set('authorization', authorization)
          .set('idempotency-key', key)
          .send(body)

      await t.test(
        'admin creation returns stable IDs, same-key concurrent replay writes one audit, duplicate codes conflict',
        async () => {
          const repeat = await f.createTeam(teamBody, teamKey).expect(200)
          assert.deepEqual(repeat.body, created.body)
          await f
            .createTeam({ ...teamBody, profile: { name: 'Changed request' } }, teamKey)
            .expect(409)
          await f.createTeam(teamBody).expect(409)
          assert.equal(
            await prisma.auditLog.count({ where: { targetId: teamId, action: 'TEAM_CREATED' } }),
            1,
          )
          const rows = await http
            .get('/api/admin/center/teams')
            .set('authorization', auth)
            .expect(200)
          assert.ok(rows.body.items.some((item: { id: string }) => item.id === teamId))
          assert.equal(await prisma.teamRegistration.count({ where: { teamId } }), 0)
          const concurrentBody = { ...teamBody, teamCode: `CONCURRENT-${f.suffix}` }
          const concurrentKey = randomUUID()
          const [left, right] = await Promise.all([
            f.createTeam(concurrentBody, concurrentKey).expect(200),
            f.createTeam(concurrentBody, concurrentKey).expect(200),
          ])
          assert.deepEqual(left.body, right.body)
          assert.equal(
            await prisma.auditLog.count({
              where: { targetId: left.body.id as string, action: 'TEAM_CREATED' },
            }),
            1,
          )
        },
      )

      await t.test(
        'anonymous/ordinary users cannot create, foreign team IDs and private fields are rejected',
        async () => {
          await http.post('/api/admin/center/teams').send(teamBody).expect(401)
          await f.createTeam(teamBody, randomUUID(), f.studentAuth).expect(403)
          await f
            .createPlayer({ teamId: f.otherTeam.id, profile: { displayName: 'Foreign' }, reason })
            .expect(404)
          await f
            .createPlayer({
              teamId,
              profile: { displayName: 'Sensitive', studentId: 'PRIVATE_ID' },
              reason,
            })
            .expect(400)
          await f
            .createPlayer({
              teamId,
              profile: { displayName: 'Invalid', position: 'STRIKER' },
              reason,
            })
            .expect(400)
          await f.createTeam({ ...teamBody, teamCode: 'bad code' }).expect(400)
          await f.createTeam({ ...teamBody, profile: { name: '' } }).expect(400)
        },
      )

      const playerBody = {
        teamId,
        profile: { displayName: `FICTIONAL_TEST Member ${f.suffix}`, position: 'DEFENDER' },
        reason,
      }
      const playerKey = randomUUID()
      const player = await f.createPlayer(playerBody, playerKey).expect(200)
      const playerId = player.body.id as string
      const initialWorkspace = await workspace()
      const member = initialWorkspace.body.members.find(
        (item: { playerId: string }) => item.playerId === playerId,
      ) as { id: string; updatedAt: string }
      assert.ok(member)
      const memberPath = `/api/captain/teams/${teamId}/members/${member.id}`
      await t.test(
        'player creation is idempotent, active membership reads back and no official lineup is fabricated',
        async () => {
          assert.deepEqual(
            (await f.createPlayer(playerBody, playerKey).expect(200)).body,
            player.body,
          )
          await f
            .createPlayer({ ...playerBody, profile: { displayName: 'Different' } }, playerKey)
            .expect(409)
          assert.equal(
            await prisma.teamMembership.count({
              where: { teamId, playerProfileId: playerId, status: 'ACTIVE' },
            }),
            1,
          )
          assert.equal(
            await prisma.auditLog.count({
              where: { targetId: playerId, action: 'PLAYER_CREATED' },
            }),
            1,
          )
          assert.equal(
            await prisma.rosterSnapshotEntry.count({ where: { playerProfileId: playerId } }),
            0,
          )
          assert.equal(await prisma.matchAppearance.count({ where: { playerId } }), 0)
          const rows = await http
            .get('/api/admin/center/players')
            .set('authorization', auth)
            .expect(200)
          assert.ok(rows.body.items.some((item: { id: string }) => item.id === playerId))
        },
      )

      const profileBody = {
        expectedUpdatedAt: initialWorkspace.body.team.updatedAt as string,
        patch: {
          name: 'FICTIONAL_TEST Updated Team',
          description: 'Saved team profile',
          motto: 'Saved motto',
          shortName: '',
          foundedYear: 2020,
        },
        reason,
      }
      const profileRequestKey = randomUUID()
      const registration = await prisma.teamRegistration.create({
        data: {
          organizationId: f.org.id,
          tournamentId: f.tournament.id,
          teamId,
          status: 'APPROVED',
        },
      })
      const submission = await prisma.rosterSubmission.create({
        data: {
          organizationId: f.org.id,
          teamRegistrationId: registration.id,
          submissionVersion: 1,
          status: 'LOCKED',
          sourceFileHash: 'a'.repeat(64),
          lockedAt: new Date(),
        },
      })
      const snapshot = await prisma.rosterSnapshot.create({
        data: {
          organizationId: f.org.id,
          tournamentId: f.tournament.id,
          teamId,
          teamRegistrationId: registration.id,
          rosterSubmissionId: submission.id,
          snapshotVersion: 1,
          sourceFileHash: submission.sourceFileHash,
        },
      })
      const snapshotEntry = await prisma.rosterSnapshotEntry.create({
        data: {
          organizationId: f.org.id,
          rosterSnapshotId: snapshot.id,
          playerProfileId: playerId,
          displayName: 'FICTIONAL_TEST Historical Name',
          shirtNumber: '9',
        },
      })
      await prisma.rosterSnapshot.update({
        where: { id: snapshot.id },
        data: { lockedAt: new Date() },
      })
      await t.test(
        'captain profile saves persist on fresh reads, stale/conflicting replays reject',
        async () => {
          const key = profileRequestKey
          const first = await profilePut(profileBody, key).expect(200)
          assert.deepEqual((await profilePut(profileBody, key).expect(200)).body, first.body)
          assert.notEqual(first.body.updatedAt, profileBody.expectedUpdatedAt)
          const refreshed = await workspace()
          assert.equal(refreshed.body.team.description, profileBody.patch.description)
          assert.equal(refreshed.body.team.motto, profileBody.patch.motto)
          assert.equal(refreshed.body.team.foundedYear, 2020)
          assert.equal(
            (await prisma.team.findUniqueOrThrow({ where: { id: teamId } })).shortName,
            null,
          )
          await profilePut(profileBody).expect(409)
          await profilePut({ ...profileBody, patch: { name: 'Different' } }, key).expect(409)
          assert.equal(
            await prisma.auditLog.count({
              where: { targetId: teamId, action: 'TEAM_PROFILE_UPDATED' },
            }),
            1,
          )
        },
      )

      await t.test(
        'ordinary users, other-team captains and other-organization administrators cannot edit or remove',
        async () => {
          for (const authorization of [f.studentAuth, f.crossAuth]) {
            await profilePut(profileBody, randomUUID(), authorization).expect(403)
            await http
              .put(memberPath)
              .set('authorization', authorization)
              .set('idempotency-key', randomUUID())
              .send({ position: 'FORWARD', expectedUpdatedAt: member.updatedAt, reason })
              .expect(403)
            await http
              .delete(memberPath)
              .set('authorization', authorization)
              .set('idempotency-key', randomUUID())
              .send({ expectedUpdatedAt: member.updatedAt, reason })
              .expect(403)
          }
          await profilePut(profileBody, randomUUID(), f.otherAuth).expect(404)
          await profilePut({ ...profileBody, patch: { teamCode: 'ILLEGAL' } }).expect(400)
        },
      )

      await t.test(
        'member position CAS survives refresh, duplicate commands audit once, partial metadata rejects',
        async () => {
          const body = { position: 'FORWARD', expectedUpdatedAt: member.updatedAt, reason }
          const key = randomUUID()
          const put = (payload: object, requestKey = key) =>
            http
              .put(memberPath)
              .set('authorization', f.captainAuth)
              .set('idempotency-key', requestKey)
              .send(payload)
          await put(body).expect(200)
          await put(body).expect(200)
          const refreshed = await workspace()
          assert.equal(
            refreshed.body.members.find((item: { id: string }) => item.id === member.id).position,
            'FORWARD',
          )
          await put(body, randomUUID()).expect(409)
          await put({ ...body, position: 'MIDFIELDER' }).expect(409)
          await put({ position: 'MIDFIELDER' }, randomUUID()).expect(400)
          await http
            .put(memberPath)
            .set('authorization', f.captainAuth)
            .send({ position: 'MIDFIELDER', reason })
            .expect(400)
          assert.equal(
            await prisma.auditLog.count({
              where: { targetId: member.id, action: 'TEAM_MEMBER_POSITION_UPDATED' },
            }),
            1,
          )
        },
      )

      await t.test(
        'legacy all-metadata-absent member update remains functional, removal retains history and replays safely',
        async () => {
          await http
            .put(memberPath)
            .set('authorization', f.captainAuth)
            .send({ position: 'MIDFIELDER' })
            .expect(200)
          const refreshed = await workspace()
          const current = refreshed.body.members.find(
            (item: { id: string }) => item.id === member.id,
          ) as { updatedAt: string }
          const body = { expectedUpdatedAt: current.updatedAt, reason }
          const key = randomUUID()
          const remove = () =>
            http
              .delete(memberPath)
              .set('authorization', f.captainAuth)
              .set('idempotency-key', key)
              .send(body)
          await remove().expect(200)
          await remove().expect(200)
          assert.ok(
            !(await workspace()).body.members.some((item: { id: string }) => item.id === member.id),
          )
          assert.equal(
            (await prisma.teamMembership.findUniqueOrThrow({ where: { id: member.id } })).status,
            'REMOVED',
          )
          assert.ok(await prisma.playerProfile.findUnique({ where: { id: playerId } }))
          assert.equal(
            await prisma.auditLog.count({
              where: { targetId: member.id, action: 'TEAM_MEMBER_REMOVED' },
            }),
            1,
          )
        },
      )

      await t.test(
        'same-version concurrent profile edits have one winner and one conflict',
        async () => {
          const current = await workspace()
          const expectedUpdatedAt = current.body.team.updatedAt as string
          const [left, right] = await Promise.all([
            profilePut({ expectedUpdatedAt, patch: { motto: 'Concurrent left' }, reason }),
            profilePut({ expectedUpdatedAt, patch: { motto: 'Concurrent right' }, reason }),
          ])
          assert.deepEqual([left.status, right.status].sort(), [200, 409])
          const refreshed = await workspace()
          assert.equal(
            refreshed.body.team.motto,
            left.status === 200 ? 'Concurrent left' : 'Concurrent right',
          )
        },
      )
      await t.test(
        'a captain linked through a player profile cannot be removed as an ordinary member',
        async () => {
          const profile = await f
            .createPlayer({
              teamId,
              profile: { displayName: 'FICTIONAL_TEST Linked Captain' },
              reason,
            })
            .expect(200)
          await prisma.user.update({
            where: { id: f.captain.id },
            data: { playerProfileId: profile.body.id as string },
          })
          const current = await workspace()
          const captainMember = current.body.members.find(
            (item: { playerId: string }) => item.playerId === profile.body.id,
          ) as { id: string; isCaptain: boolean; updatedAt: string }
          assert.equal(captainMember.isCaptain, true)
          await http
            .delete(`/api/captain/teams/${teamId}/members/${captainMember.id}`)
            .set('authorization', f.captainAuth)
            .set('idempotency-key', randomUUID())
            .send({ expectedUpdatedAt: captainMember.updatedAt, reason })
            .expect(409)
        },
      )
      await t.test('fresh role revocation rejects both new writes and cached replay', async () => {
        await prisma.roleAssignment.updateMany({
          where: { userId: f.captain.id },
          data: { revokedAt: new Date() },
        })
        await profilePut(profileBody).expect(403)
        await profilePut(profileBody, profileRequestKey).expect(403)
        await http
          .get(`/api/captain/teams/${teamId}`)
          .set('authorization', f.captainAuth)
          .expect(403)
      })
      await t.test(
        'club profile/member changes preserve locked official roster facts',
        async () => {
          const stored = await prisma.rosterSnapshotEntry.findUniqueOrThrow({
            where: { id: snapshotEntry.id },
          })
          assert.equal(stored.displayName, 'FICTIONAL_TEST Historical Name')
          assert.equal(stored.shirtNumber, '9')
          assert.equal(stored.playerProfileId, playerId)
          assert.equal(await prisma.rosterSnapshot.count({ where: { teamId } }), 1)
          assert.equal(await prisma.matchAppearance.count({ where: { playerId } }), 0)
        },
      )
    } finally {
      await f.app.close()
      await prisma.$disconnect()
    }
  },
)

test(
  'team directory public HTTP: new clubs and members visible without fabricated tournament eligibility',
  { timeout: 90000 },
  async (t) => {
    const f = await fixture()
    try {
      const created = await f
        .createTeam({
          teamCode: `DIRECTORY-${f.suffix}`,
          profile: { name: `FICTIONAL_TEST Directory ${f.suffix}` },
          reason: f.reason,
        })
        .expect(200)
      const teamId = created.body.id as string
      const member = await f
        .createPlayer({
          teamId,
          profile: { displayName: `FICTIONAL_TEST Visible ${f.suffix}`, position: 'DEFENDER' },
          reason: f.reason,
        })
        .expect(200)
      const playerId = member.body.id as string
      const publicGet = (path: string, organizationId = f.org.id) =>
        f.http
          .get(`/api${path}`)
          .set('x-organization-id', organizationId)
          .set('authorization', organizationId === f.org.id ? f.studentAuth : f.otherAuth)
      await t.test(
        'search, preferences, team dashboard and player detail read newly created actual records',
        async () => {
          const search = await publicGet(
            `/public/search?query=${f.suffix}&tournamentId=${f.tournament.id}`,
          ).expect(200)
          assert.ok(search.body.teams.some((item: { id: string }) => item.id === teamId))
          assert.ok(search.body.players.some((item: { id: string }) => item.id === playerId))
          const preferences = await f.http
            .get(`/api/me/team-preferences?tournamentId=${f.tournament.id}`)
            .set('authorization', f.studentAuth)
            .expect(200)
          assert.ok(
            preferences.body.availableTeams.some((item: { id: string }) => item.id === teamId),
          )
          const dashboard = await publicGet(
            `/public/teams/${teamId}/dashboard?tournamentId=${f.tournament.id}`,
          ).expect(200)
          assert.equal(dashboard.body.rosterSource, 'TEAM_MEMBERSHIP')
          assert.ok(dashboard.body.roster.some((item: { id: string }) => item.id === playerId))
          const profile = await publicGet(
            `/public/players/${playerId}?tournamentId=${f.tournament.id}`,
          ).expect(200)
          assert.equal(profile.body.team.id, teamId)
          assert.equal(profile.body.shirtNumber, null)
          assert.equal(profile.body.stats.appearances, 0)
          assert.equal(await f.prisma.teamRegistration.count({ where: { teamId } }), 0)
          assert.equal(await f.prisma.rosterSnapshot.count({ where: { teamId } }), 0)
          assert.equal(await f.prisma.matchAppearance.count({ where: { playerId } }), 0)
          for (const secretField of ['studentId', 'studentIdMasked', 'sourceKey', 'passwordHash'])
            assert.ok(!(secretField in profile.body))
        },
      )
      await t.test(
        'same-name players retain distinct IDs; foreign organization cannot read new records',
        async () => {
          const sameName = await f
            .createPlayer({
              teamId,
              profile: { displayName: member.body.displayName as string },
              reason: f.reason,
            })
            .expect(200)
          assert.notEqual(sameName.body.id, playerId)
          await publicGet(`/public/teams/${teamId}/dashboard`, f.other.id).expect(404)
          await publicGet(`/public/players/${playerId}`, f.other.id).expect(404)
        },
      )
      await t.test(
        'new members remain visible beside a locked roster with explicit sources and no match eligibility',
        async () => {
          const registration = await f.prisma.teamRegistration.create({
            data: {
              organizationId: f.org.id,
              tournamentId: f.tournament.id,
              teamId,
              status: 'APPROVED',
            },
          })
          const submission = await f.prisma.rosterSubmission.create({
            data: {
              organizationId: f.org.id,
              teamRegistrationId: registration.id,
              submissionVersion: 1,
              status: 'LOCKED',
              sourceFileHash: 'b'.repeat(64),
              lockedAt: new Date(),
            },
          })
          const snapshot = await f.prisma.rosterSnapshot.create({
            data: {
              organizationId: f.org.id,
              tournamentId: f.tournament.id,
              teamId,
              teamRegistrationId: registration.id,
              rosterSubmissionId: submission.id,
              snapshotVersion: 1,
              sourceFileHash: submission.sourceFileHash,
            },
          })
          await f.prisma.rosterSnapshotEntry.create({
            data: {
              organizationId: f.org.id,
              rosterSnapshotId: snapshot.id,
              playerProfileId: playerId,
              displayName: member.body.displayName as string,
              shirtNumber: '9',
            },
          })
          await f.prisma.rosterSnapshot.update({
            where: { id: snapshot.id },
            data: { lockedAt: new Date() },
          })
          const added = await f
            .createPlayer({
              teamId,
              profile: { displayName: 'FICTIONAL_TEST New Club Member' },
              reason: f.reason,
            })
            .expect(200)
          const addedId = added.body.id as string
          const dashboard = await publicGet(
            `/public/teams/${teamId}/dashboard?tournamentId=${f.tournament.id}`,
          ).expect(200)
          assert.equal(dashboard.body.rosterSource, 'MIXED')
          const official = dashboard.body.roster.find(
            (item: { id: string }) => item.id === playerId,
          ) as { rosterSource: string; shirtNumber: string }
          const clubMember = dashboard.body.roster.find(
            (item: { id: string }) => item.id === addedId,
          ) as { rosterSource: string; shirtNumber: null }
          assert.equal(official.rosterSource, 'OFFICIAL_SNAPSHOT')
          assert.equal(official.shirtNumber, '9')
          assert.equal(clubMember.rosterSource, 'TEAM_MEMBERSHIP')
          assert.equal(clubMember.shirtNumber, null)
          assert.equal(
            await f.prisma.rosterSnapshotEntry.count({ where: { playerProfileId: addedId } }),
            0,
          )
          assert.equal(await f.prisma.matchAppearance.count({ where: { playerId: addedId } }), 0)
          await publicGet(`/public/players/${addedId}?tournamentId=${f.tournament.id}`).expect(200)
        },
      )
    } finally {
      await f.app.close()
      await f.prisma.$disconnect()
    }
  },
)
