import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import sharp from 'sharp'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'
import { hashPassword } from '../auth/password'
import { acceptReporterContribution, refreshReporterState } from './reporter-quality.service'

test(
  'campus real database: student ownership, private directory, scoped catalog and reporter lifecycle',
  { timeout: 120000 },
  async (t) => {
    const url = process.env.TEST_DATABASE_URL
    assert(url, 'TEST_DATABASE_URL is required')
    assert.match(new URL(url).pathname, /(?:_|\/)(?:test|ci)(?:_|$)/)
    assert.notEqual(url, process.env.DATABASE_URL, 'Tests must not write the application database')
    const prisma = new PrismaClient({ datasources: { db: { url } } })
    const suffix = randomUUID().slice(0, 8)
    const org = await prisma.organization.create({
      data: { slug: `campus-test-${suffix}`, name: 'FICTIONAL_TEST 校园' },
    })
    const other = await prisma.organization.create({
      data: { slug: `campus-other-${suffix}`, name: 'FICTIONAL_TEST 其他组织' },
    })
    const password = 'Fictional-Campus-2026!'
    const digest = hashPassword(password)
    async function account(name: string, organizationId = org.id, admin = false) {
      const user = await prisma.user.create({
        data: {
          displayName: `测试-${name}`,
          loginNameNormalized: `campus-${suffix}-${name}`,
          memberships: { create: { organizationId, status: 'ACTIVE' } },
          passwordCredential: {
            create: {
              passwordHash: digest.hash,
              passwordSalt: digest.salt,
              algorithm: digest.algorithm,
            },
          },
          ...(admin
            ? {
                roleAssignments: {
                  create: {
                    organizationId,
                    role: 'ORGANIZATION_ADMIN',
                    scopeType: 'ORGANIZATION',
                    scopeId: organizationId,
                  },
                },
              }
            : {}),
        },
      })
      return user
    }
    const [admin, reporter, viewer, otherAdmin] = await Promise.all([
      account('admin', org.id, true),
      account('reporter'),
      account('viewer'),
      account('other', other.id, true),
    ])
    const season = await prisma.season.create({
      data: { organizationId: org.id, seasonCode: 'TEST', name: '测试赛季', isDemo: true },
    })
    const definition = await prisma.competitionDefinition.create({
      data: {
        organizationId: org.id,
        code: 'GREEN_MEN',
        cupName: '绿茵杯',
        gender: 'MALE',
        name: '绿茵杯',
      },
    })
    const competition = await prisma.tournament.create({
      data: {
        organizationId: org.id,
        seasonId: season.id,
        competitionDefinitionId: definition.id,
        tournamentCode: 'CAMPUS-TEST',
        name: 'FICTIONAL_TEST 赛事',
        status: 'PUBLISHED',
      },
    })
    const team = await prisma.team.create({
      data: { organizationId: org.id, teamCode: 'TEST', name: '测试队' },
    })
    const registration = await prisma.teamRegistration.create({
      data: {
        organizationId: org.id,
        tournamentId: competition.id,
        teamId: team.id,
        status: 'APPROVED',
      },
    })
    const submission = await prisma.rosterSubmission.create({
      data: {
        organizationId: org.id,
        teamRegistrationId: registration.id,
        submissionVersion: 1,
        status: 'APPROVED',
        sourceFileHash: 'a'.repeat(64),
      },
    })
    const snapshot = await prisma.rosterSnapshot.create({
      data: {
        organizationId: org.id,
        tournamentId: competition.id,
        teamId: team.id,
        teamRegistrationId: registration.id,
        rosterSubmissionId: submission.id,
        snapshotVersion: 1,
        sourceFileHash: 'a'.repeat(64),
        lockedAt: new Date(),
      },
    })
    const rule = await prisma.competitionRuleVersion.create({
      data: {
        organizationId: org.id,
        tournamentId: competition.id,
        version: 1,
        name: '测试规则',
        rules: {},
        status: 'PUBLISHED',
      },
    })
    const matches = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        prisma.match.create({
          data: {
            organizationId: org.id,
            tournamentId: competition.id,
            matchCode: `TEST-${index}`,
            title: '测试比赛',
            status: 'FINISHED',
            confirmedReportVersion: 2,
            reportVersion: 2,
          },
        }),
      ),
    )
    const revisions = await Promise.all(
      matches.map((match) =>
        prisma.matchReportRevision.create({
          data: {
            organizationId: org.id,
            matchId: match.id,
            version: 1,
            status: 'SUBMITTED',
            action: 'SUBMIT',
            fields: { outcome: 'FINISHED' },
            homeRosterSnapshotId: snapshot.id,
            awayRosterSnapshotId: snapshot.id,
            ruleVersionId: rule.id,
            createdByUserId: reporter.id,
          },
        }),
      ),
    )
    await prisma.roleAssignment.create({
      data: {
        organizationId: org.id,
        userId: reporter.id,
        role: 'MATCH_REPORTER',
        scopeType: 'TOURNAMENT',
        scopeId: competition.id,
      },
    })
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile()
    const app = module.createNestApplication()
    configureApp(app)
    await app.init()
    t.after(async () => {
      await app.close()
      await prisma.$disconnect()
    })
    const http = request(app.getHttpServer())
    async function login(user: typeof admin, organizationId = org.id) {
      return (
        await http
          .post('/api/auth/login')
          .set('x-organization-id', organizationId)
          .send({ username: user.loginNameNormalized, password })
          .expect(200)
      ).body.accessToken as string
    }
    const [adminToken, reporterToken, viewerToken, otherToken] = await Promise.all([
      login(admin),
      login(reporter),
      login(viewer),
      login(otherAdmin, other.id),
    ])
    const get = (path: string, token: string) =>
      http.get('/api/' + path).set('authorization', 'Bearer ' + token)
    const post = (path: string, token: string, body: object, key = randomUUID()) =>
      http
        .post('/api/' + path)
        .set('authorization', 'Bearer ' + token)
        .set('idempotency-key', key)
        .send(body)

    await t.test(
      'all directories are scoped and student identity never leaks into public catalog',
      async () => {
        await http.get('/api/admin/campus/students').expect(401)
        await get('admin/campus/students', viewerToken).expect(403)
        const catalogue = await http
          .get('/api/public/competition-catalog')
          .set('x-organization-id', org.id)
          .expect(200)
        assert.equal(catalogue.body.competitions.length, 1)
        assert.equal(catalogue.body.seasons[0].isDemo, true)
        assert(!JSON.stringify(catalogue.body).includes('studentNumber'))
        await http
          .get('/api/public/home?competitionId=invalid')
          .set('x-organization-id', org.id)
          .expect(400)
      },
    )

    let studentId = '',
      studentVersion = 1,
      registeredToken = '',
      registeredUserId = '',
      playerId = ''
    await t.test(
      'registration matches a directory record but cannot claim a player before administrator verification',
      async () => {
        const student = await prisma.studentRecord.create({
          data: {
            organizationId: org.id,
            realName: '虚构测试学生',
            studentNumber: `98${String(Date.now()).slice(-8)}`,
            cohort: 'CAMPUS_TEST',
            isDemo: true,
            sourceType: 'DEMO_FIXTURE',
          },
        })
        studentId = student.id
        const player = await prisma.playerProfile.create({
          data: {
            organizationId: org.id,
            displayName: student.realName,
            studentRecordId: student.id,
            sourceType: 'DEMO_FIXTURE',
            sourceKey: suffix,
          },
        })
        playerId = player.id
        const registration = {
          username: `campus-new-${suffix}`,
          displayName: '测试昵称',
          realName: student.realName,
          studentId: student.studentNumber,
          password: 'TestOnly6!',
        }
        process.env.REGISTRATION_ENABLED = 'false'
        try {
          const closed = await http
            .post('/api/auth/register')
            .set('x-organization-id', org.id)
            .send(registration)
            .expect(403)
          assert.equal(closed.body.message, '测试阶段暂未开放注册')
          await http
            .post('/api/auth/email/code')
            .set('x-organization-id', org.id)
            .send({ email: `closed-${suffix}@example.test`, purpose: 'REGISTER' })
            .expect(403)
        } finally {
          delete process.env.REGISTRATION_ENABLED
        }
        const signed = await http
          .post('/api/auth/register')
          .set('x-organization-id', org.id)
          .send({
            username: `campus-new-${suffix}`,
            displayName: '测试昵称',
            realName: student.realName,
            studentId: student.studentNumber,
            password: 'TestOnly6!',
          })
          .expect(201)
        registeredToken = signed.body.accessToken
        registeredUserId = signed.body.user.id
        const before = await get('me/campus-profile', registeredToken).expect(200)
        assert.equal(before.body.studentRecord.id, student.id)
        assert.equal(before.body.playerCandidate, null)
        assert.equal(before.body.identityNeedsReview, true)
        await post('me/campus/onboarding', registeredToken, { action: 'TUTORIAL_COMPLETE' }).expect(
          201,
        )
        await post('me/campus/onboarding', registeredToken, {
          action: 'CONFIRM_PLAYER',
          playerId,
        }).expect(403)
        await post(`admin/campus/students/${studentId}/user`, otherToken, {
          userId: registeredUserId,
          expectedVersion: 1,
          reason: '跨组织不能关联',
        }).expect(404)
        await post(`admin/campus/students/${studentId}/user`, adminToken, {
          userId: registeredUserId,
          expectedVersion: 1,
          reason: '核对虚构姓名学号和所属学生档案',
        }).expect(201)
        studentVersion = 2
        const candidate = await get('me/campus-profile', registeredToken).expect(200)
        assert.equal(candidate.body.playerCandidate.id, playerId)
        await post('me/campus/onboarding', registeredToken, {
          action: 'CONFIRM_PLAYER',
          playerId,
        }).expect(201)
        assert.equal(
          (await get('auth/me', registeredToken).expect(200)).body.linkedPlayer.id,
          playerId,
        )
      },
    )

    await t.test(
      'student edits synchronize account and player; stale and cross-organization writes fail',
      async () => {
        const existing = await get(`admin/campus/students/${studentId}`, adminToken).expect(200)
        assert.equal(existing.body.user.id, registeredUserId)
        const body = {
          realName: '虚构姓名修订',
          studentNumber: existing.body.studentNumber,
          gender: 'UNSPECIFIED',
          collegeName: '测试学院',
          academicYear: '2026级',
          expectedVersion: studentVersion,
          reason: '核验后同步学生基础资料',
        }
        const key = randomUUID()
        const save = () =>
          http
            .patch('/api/admin/campus/students/' + studentId)
            .set('authorization', 'Bearer ' + adminToken)
            .set('idempotency-key', key)
            .send(body)
        const first = await save().expect(200),
          second = await save().expect(200)
        assert.equal(first.body.version, second.body.version)
        const after = await get(`admin/campus/students/${studentId}`, adminToken).expect(200)
        assert.equal(after.body.user.realName, body.realName)
        assert.equal(after.body.player.displayName, body.realName)
        await http
          .patch('/api/admin/campus/students/' + studentId)
          .set('authorization', 'Bearer ' + adminToken)
          .set('idempotency-key', randomUUID())
          .send(body)
          .expect(409)
        await get(`admin/campus/students/${studentId}`, otherToken).expect(404)
      },
    )

    await t.test(
      'profile image writes require fresh versions and organization ownership',
      async () => {
        const current = await prisma.user.findUniqueOrThrow({ where: { id: registeredUserId } })
        const image = await sharp({
          create: { width: 128, height: 128, channels: 3, background: '#284c38' },
        })
          .png()
          .toBuffer()
        const body = {
          targetType: 'USER',
          targetId: registeredUserId,
          slot: 'AVATAR',
          expectedUpdatedAt: current.updatedAt.toISOString(),
          dataUrl: `data:image/png;base64,${image.toString('base64')}`,
          reason: '测试管理员维护个人头像',
        }
        await post('admin/campus/profile-media', viewerToken, body).expect(403)
        await post('admin/campus/profile-media', otherToken, body).expect(404)
        const key = randomUUID()
        const saved = await post('admin/campus/profile-media', adminToken, body, key).expect(201)
        const replay = await post('admin/campus/profile-media', adminToken, body, key).expect(201)
        assert.equal(saved.body.url, replay.body.url)
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: registeredUserId } })).avatarUrl,
          saved.body.url,
        )
        await post('admin/campus/profile-media', adminToken, body).expect(409)
        await http
          .get(saved.body.url)
          .expect(200)
          .expect('Content-Type', /image\/webp/)
        // A compiled test has a deeper path than the normal API; clean its own image fixture.
        const fileName = String(saved.body.url).split('/').at(-1)!
        assert.match(fileName, /^[a-f0-9]{64}\.webp$/)
        t.after(() =>
          unlink(resolve(__dirname, '../../../../private-data/media/avatars', fileName)),
        )
      },
    )

    await t.test(
      'organization administrators cannot change an account shared with another organization',
      async () => {
        await prisma.organizationMembership.create({
          data: { organizationId: other.id, userId: viewer.id, status: 'ACTIVE' },
        })
        const before = await prisma.user.findUniqueOrThrow({ where: { id: viewer.id } })
        await http
          .patch('/api/admin/campus/users/' + viewer.id + '/profile')
          .set('authorization', 'Bearer ' + adminToken)
          .set('idempotency-key', randomUUID())
          .send({
            expectedUpdatedAt: before.updatedAt.toISOString(),
            displayName: '不应修改',
            reason: '组织边界测试',
          })
          .expect(409)
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: viewer.id } })).displayName,
          before.displayName,
        )
      },
    )

    await t.test(
      'tournament administrators see only the catalog entries for their current grants',
      async () => {
        await get('admin/campus/competitions', viewerToken).expect(403)
        const role = await prisma.roleAssignment.create({
          data: {
            organizationId: org.id,
            userId: viewer.id,
            role: 'TOURNAMENT_ADMIN',
            scopeType: 'TOURNAMENT',
            scopeId: competition.id,
          },
        })
        const another = await prisma.competitionDefinition.create({
          data: {
            organizationId: org.id,
            code: 'OTHER_WOMEN',
            cupName: '测试杯',
            name: '测试杯',
            gender: 'FEMALE',
          },
        })
        const scoped = await get('admin/campus/competitions', viewerToken).expect(200)
        assert.deepEqual(
          scoped.body.tournaments.map((item: { id: string }) => item.id),
          [competition.id],
        )
        assert(!scoped.body.competitions.some((item: { id: string }) => item.id === another.id))
        await prisma.roleAssignment.update({
          where: { id: role.id },
          data: { revokedAt: new Date() },
        })
        await get('admin/campus/competitions', viewerToken).expect(403)
      },
    )

    await t.test(
      'season team information changes leave the base team and locked roster intact',
      async () => {
        const secondSubmission = await prisma.rosterSubmission.create({
          data: {
            organizationId: org.id,
            teamRegistrationId: registration.id,
            submissionVersion: 2,
            status: 'APPROVED',
            sourceFileHash: 'b'.repeat(64),
          },
        })
        const historical = await prisma.rosterSnapshot.create({
          data: {
            organizationId: org.id,
            tournamentId: competition.id,
            teamId: team.id,
            teamRegistrationId: registration.id,
            rosterSubmissionId: secondSubmission.id,
            snapshotVersion: 2,
            sourceFileHash: 'b'.repeat(64),
          },
        })
        const entry = await prisma.rosterSnapshotEntry.create({
          data: {
            organizationId: org.id,
            rosterSnapshotId: historical.id,
            playerProfileId: playerId,
            displayName: '历史锁定姓名',
            shirtNumber: '08',
          },
        })
        await prisma.rosterSnapshot.update({
          where: { id: historical.id },
          data: { lockedAt: new Date() },
        })
        const before = await prisma.teamRegistration.findUniqueOrThrow({
          where: { id: registration.id },
        })
        const body = {
          expectedUpdatedAt: before.updatedAt.toISOString(),
          name: '本赛季球队名称',
          shortName: '本季',
          collegeName: '测试学院',
          description: '本赛季球队资料',
          motto: '认真记录',
          reason: '维护本赛季展示资料',
        }
        const update = (token: string) =>
          http
            .patch('/api/admin/campus/team-seasons/' + registration.id)
            .set('authorization', 'Bearer ' + token)
            .set('idempotency-key', randomUUID())
            .send(body)
        await update(otherToken).expect(404)
        await update(adminToken).expect(200)
        await update(adminToken).expect(409)
        assert.equal(
          (await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).name,
          team.name,
        )
        assert.deepEqual(
          await prisma.rosterSnapshotEntry.findUniqueOrThrow({ where: { id: entry.id } }),
          entry,
        )
        const listing = await get(
          'admin/campus/team-seasons?tournamentId=' + competition.id,
          adminToken,
        ).expect(200)
        assert.equal(listing.body.items[0].seasonTeam.name, body.name)
        assert.equal(listing.body.items[0].rosterSnapshots[0].entries[0].shirtNumber, '08')
      },
    )

    let caseId = '',
      profileId = ''
    await t.test(
      'reports do not deduct; duplicates merge; only confirmed administrator reviews deduct once',
      async () => {
        const before = (await get('me/reporter-quality', reporterToken).expect(200)).body
        profileId = before.profile.id
        assert.equal(before.profile.score, 100)
        const body = {
          reportRevisionId: revisions[0]!.id,
          errorKey: 'score-home',
          description: '测试现场记录证明主队比分需要核实',
          evidence: [],
        }
        const created = await post(
          `matches/${matches[0]!.id}/corrections`,
          viewerToken,
          body,
        ).expect(201)
        caseId = created.body.id
        assert.equal(
          (await get('me/reporter-quality', reporterToken).expect(200)).body.profile.score,
          100,
        )
        const duplicate = await post(
          `matches/${matches[0]!.id}/corrections`,
          viewerToken,
          body,
        ).expect(201)
        assert.equal(duplicate.body.id, caseId)
        assert.equal(duplicate.body.merged, true)
        await post(`admin/campus/corrections/${caseId}/review`, reporterToken, {
          decision: 'CONFIRMED',
          expectedVersion: 1,
          reason: '普通信息员不能自行裁定',
        }).expect(403)
        await post(`admin/campus/corrections/${caseId}/review`, otherToken, {
          decision: 'CONFIRMED',
          expectedVersion: 1,
          reason: '跨组织不能处理',
        }).expect(404)
        const key = randomUUID(),
          review = {
            decision: 'CONFIRMED',
            expectedVersion: 1,
            reason: '已核对原始记录，确认本次差错',
          }
        await post(`admin/campus/corrections/${caseId}/review`, adminToken, review, key).expect(201)
        await post(`admin/campus/corrections/${caseId}/review`, adminToken, review, key).expect(201)
        assert.equal(
          (await get('me/reporter-quality', reporterToken).expect(200)).body.profile.score,
          90,
        )
      },
    )

    await t.test(
      'three distinct approved matches reward once; an appeal reverses only its own penalty',
      async () => {
        for (let i = 1; i < 4; i++)
          await prisma.$transaction((tx) =>
            acceptReporterContribution(tx, org.id, reporter.id, matches[i]!.id, revisions[i]!.id),
          )
        await prisma.$transaction((tx) =>
          acceptReporterContribution(tx, org.id, reporter.id, matches[1]!.id, revisions[1]!.id),
        )
        const score = (await get('me/reporter-quality', reporterToken).expect(200)).body
        assert.equal(score.profile.score, 100)
        assert.equal(score.entries.filter((e: { kind: string }) => e.kind === 'REWARD').length, 1)
        const record = score.cases.find((c: { id: string }) => c.id === caseId)
        await post(`me/reporter-corrections/${caseId}/appeal`, reporterToken, {
          expectedVersion: record.version,
          reason: '补充完整现场视频，请重新核对责任记录',
        }).expect(201)
        const appealed = await prisma.reporterCorrectionCase.findUniqueOrThrow({
          where: { id: caseId },
        })
        await post(`admin/campus/corrections/${caseId}/review`, adminToken, {
          expectedVersion: appealed.version,
          decision: 'OVERTURNED',
          reason: '完整证据证明原裁定有误，撤销该次扣分',
        }).expect(201)
        assert.equal(
          (await get('me/reporter-quality', reporterToken).expect(200)).body.profile.score,
          100,
        )
      },
    )

    await t.test(
      'freeze, cooldown, probation and zero-score permanent ban are enforced by the server',
      async () => {
        await prisma.reporterProfile.update({
          where: { id: profileId },
          data: { score: 50, status: 'FROZEN', freezeReason: 'LOW_SCORE' },
        })
        await post('me/reporter-reinstatements', reporterToken, {
          reason: '已复核差错来源，完成训练并申请恢复记录资格',
        }).expect(201)
        const application = await prisma.reporterReinstatement.findFirstOrThrow({
          where: { profileId, status: 'SUBMITTED' },
        })
        await post(`admin/campus/reinstatements/${application.id}/review`, adminToken, {
          decision: 'APPROVED',
          expectedVersion: application.version,
          reason: '确认已完成复训，按七天冷却期处理',
        }).expect(201)
        const cooling = (await get('me/reporter-quality', reporterToken).expect(200)).body.profile
        assert.equal(cooling.status, 'COOLDOWN')
        const restoredAt = new Date(Date.now() - 10 * 86400000)
        await prisma.reporterProfile.update({
          where: { id: profileId },
          data: { cooldownUntil: restoredAt },
        })
        const resumed = (await get('me/reporter-quality', reporterToken).expect(200)).body.profile
        assert.equal(resumed.status, 'PROBATION')
        assert.equal(resumed.score, 60)
        assert.equal(resumed.probationStartedAt, restoredAt.toISOString())
        assert.equal(
          new Date(resumed.probationUntil).getTime(),
          restoredAt.getTime() + 90 * 86400000,
        )
        await prisma.reporterProfile.update({
          where: { id: profileId },
          data: { score: 0, status: 'BANNED' },
        })
        await post('me/reporter-reinstatements', reporterToken, {
          reason: '零分状态不能通过新申请绕过封禁',
        }).expect(403)
        await post('me/identity/applications', reporterToken, {
          kind: 'MATCH_REPORTER',
          message: '重新申请也不能绕过信息员封禁',
        }).expect(403)
      },
    )

    await t.test(
      'one complete inactive season freezes eligibility, not the ordinary user account',
      async () => {
        await prisma.reporterProfile.update({
          where: { id: profileId },
          data: {
            score: 100,
            status: 'ACTIVE',
            activitySince: new Date('2020-01-01Z'),
            probationStartedAt: null,
            probationUntil: null,
          },
        })
        await prisma.season.create({
          data: {
            organizationId: org.id,
            seasonCode: 'INACTIVE-TEST',
            name: '测试完整赛季',
            startsOn: new Date('2021-01-01Z'),
            endsOn: new Date('2021-12-31Z'),
          },
        })
        const p = await prisma.reporterProfile.findUniqueOrThrow({ where: { id: profileId } })
        const frozen = await prisma.$transaction((tx) => refreshReporterState(tx, p))
        assert.equal(frozen.status, 'FROZEN')
        assert.equal(frozen.freezeReason, 'INACTIVE_SEASON')
        assert.equal((await get('auth/me', reporterToken).expect(200)).body.id, reporter.id)
        await prisma.roleAssignment.create({
          data: {
            organizationId: org.id,
            userId: viewer.id,
            role: 'MATCH_REPORTER',
            scopeType: 'TOURNAMENT',
            scopeId: competition.id,
            grantedAt: new Date('2020-01-01Z'),
          },
        })
        const lateFirstVisit = (await get('me/reporter-quality', viewerToken).expect(200)).body
          .profile
        assert.equal(lateFirstVisit.status, 'FROZEN')
        assert.equal(lateFirstVisit.freezeReason, 'INACTIVE_SEASON')
      },
    )
  },
)
