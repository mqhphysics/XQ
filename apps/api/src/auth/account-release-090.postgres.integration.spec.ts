import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { randomInt, randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaService } from '../database/prisma.service'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { hashPassword } from './password'

test(
  '0.9.0 registration review, administrator notice, stable identity correction and old username login over isolated HTTP',
  { timeout: 90000 },
  async () => {
    const url = process.env.TEST_DATABASE_URL
    assert(url, 'An isolated TEST_DATABASE_URL is required')
    assert.match(new URL(url).pathname, /_test_/)
    if (process.env.DATABASE_URL)
      assert.notEqual(new URL(url).pathname, new URL(process.env.DATABASE_URL).pathname)
    const previousAudience = process.env.REGISTRATION_AUDIENCE,
      previousEnabled = process.env.REGISTRATION_ENABLED
    process.env.REGISTRATION_AUDIENCE = 'ALL'
    process.env.REGISTRATION_ENABLED = 'true'
    const db = new PrismaClient({ datasources: { db: { url } } })
    const password = 'Fictional-Identity-090!',
      credential = hashPassword(password)
    const org = await db.organization.create({
      data: { slug: 'account-090-' + randomUUID(), name: 'FICTIONAL_TEST 身份审核' },
    })
    const foreign = await db.organization.create({
      data: { slug: 'account-090-other-' + randomUUID(), name: 'FICTIONAL_TEST 其他组织' },
    })
    const createAdmin = async (organizationId: string) => {
      const user = await db.user.create({
        data: {
          loginNameNormalized: 'reviewer-' + randomUUID(),
          displayName: '虚构审核员',
          realName: '虚构审核员',
          verificationLevel: 'STUDENT_VERIFIED',
          memberships: { create: { organizationId, status: 'ACTIVE' } },
          passwordCredential: {
            create: {
              passwordHash: credential.hash,
              passwordSalt: credential.salt,
              algorithm: credential.algorithm,
            },
          },
        },
      })
      await db.roleAssignment.create({
        data: {
          organizationId,
          userId: user.id,
          role: 'ORGANIZATION_ADMIN',
          scopeType: 'ORGANIZATION',
          scopeId: organizationId,
          grantedByUserId: user.id,
        },
      })
      return user
    }
    const [admin, adminTwo, foreignAdmin] = await Promise.all([
      createAdmin(org.id),
      createAdmin(org.id),
      createAdmin(foreign.id),
    ])
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile()
    const app = module.createNestApplication({ logger: false })
    configureApp(app)
    await app.init()
    const http = request(app.getHttpServer())
    const login = async (username: string, organizationId = org.id) =>
      'Bearer ' +
      (
        await http
          .post('/api/auth/login')
          .set('x-organization-id', organizationId)
          .send({ username, password })
          .expect(200)
      ).body.accessToken
    const number = () => '20' + String(randomInt(100000000)).padStart(8, '0')
    try {
      const [adminToken, adminTwoToken, foreignToken] = await Promise.all([
        login(admin.loginNameNormalized!),
        login(adminTwo.loginNameNormalized!),
        login(foreignAdmin.loginNameNormalized!, foreign.id),
      ])
      await http
        .post('/api/auth/register')
        .set('x-organization-id', org.id)
        .send({ registrationSource: 'WEAPP', password })
        .expect(400)
      await http
        .post('/api/auth/register')
        .set('x-organization-id', org.id)
        .send({
          registrationSource: 'WEAPP',
          realName: '虚构用户',
          studentId: '1234567890',
          password,
        })
        .expect(400)
      const web = await http
        .post('/api/auth/register')
        .set('x-organization-id', org.id)
        .send({ registrationSource: 'WEB', password })
        .expect(201)
      assert.equal(web.body.user.realName, null)
      const originalNumber = number()
      const preflight = await http
        .post('/api/auth/registration-check')
        .set('x-organization-id', org.id)
        .send({ registrationSource: 'WEAPP', realName: '邓德阳', studentId: originalNumber })
        .expect(200)
      assert.deepEqual(preflight.body, { eligible: true, reason: 'UNMATCHED', message: '' })
      const registration = await http
        .post('/api/auth/register')
        .set('x-organization-id', org.id)
        .send({
          registrationSource: 'WEAPP',
          realName: '邓德阳',
          studentId: originalNumber,
          password,
        })
        .expect(201)
      const userId = registration.body.user.id as string,
        oldUsername = registration.body.user.username as string,
        token = 'Bearer ' + registration.body.accessToken
      assert.match(oldUsername, /^dengdeyang\d{3}$/)
      assert.equal(registration.body.user.verificationLevel, 'UNVERIFIED')
      assert.equal(registration.body.user.studentId, null)
      let mine = (
        await http.get('/api/me/campus/registration').set('authorization', token).expect(200)
      ).body
      const applicationId = mine.items[0].id as string
      assert.equal(mine.items[0].studentNumber, originalNumber)
      const list = (
        await http
          .get('/api/admin/campus/registrations')
          .set('authorization', adminToken)
          .expect(200)
      ).body
      assert(list.items.some((item: { id: string }) => item.id === applicationId))
      const reviewPath = '/api/admin/campus/registrations/' + applicationId + '/review'
      const returned = {
        expectedVersion: 1,
        decision: 'RETURN',
        reason: '虚构验收资料待更正',
        deadlineDays: 14,
      }
      await http
        .post(reviewPath)
        .set('authorization', token)
        .set('Idempotency-Key', randomUUID())
        .send(returned)
        .expect(403)
      await http
        .post(reviewPath)
        .set('authorization', foreignToken)
        .set('Idempotency-Key', randomUUID())
        .send(returned)
        .expect(409)
      const returnKey = randomUUID()
      for (let attempt = 0; attempt < 2; attempt++)
        await http
          .post(reviewPath)
          .set('authorization', adminToken)
          .set('Idempotency-Key', returnKey)
          .send(returned)
          .expect(201)
      const messages = await db.directMessage.findMany({
        where: {
          senderUserId: admin.id,
          kind: 'ADMIN_NOTICE',
          conversation: { OR: [{ userOneId: userId }, { userTwoId: userId }] },
        },
      })
      assert.equal(messages.length, 1)
      assert.equal(messages[0]!.senderUserId, admin.id)
      const metadata = messages[0]!.metadata as {
        deadlineAt: string
        applicationId: string
        actionPath: string
      }
      assert.equal(metadata.applicationId, applicationId)
      assert.match(metadata.actionPath, /correction=1/)
      assert(Math.abs(new Date(metadata.deadlineAt).getTime() - Date.now() - 14 * 86400000) < 10000)
      const correctedNumber = number(),
        correctionKey = randomUUID()
      const correction = { expectedVersion: 2, realName: '林知夏', studentNumber: correctedNumber }
      for (let attempt = 0; attempt < 2; attempt++)
        await http
          .post('/api/me/campus/registration')
          .set('authorization', token)
          .set('Idempotency-Key', correctionKey)
          .send(correction)
          .expect(201)
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: userId } })).realName, '邓德阳')
      assert.equal(
        await db.studentRecord.count({
          where: { organizationId: org.id, studentNumber: correctedNumber },
        }),
        0,
      )
      await http
        .post(reviewPath)
        .set('authorization', adminToken)
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 3, decision: 'APPROVE', reason: '已核对虚构资料' })
        .expect(201)
      let approved = await db.user.findUniqueOrThrow({ where: { id: userId } })
      const studentRecordId = approved.studentRecordId!
      assert.equal(approved.realName, '林知夏')
      assert.equal(approved.studentId, correctedNumber)
      assert.equal(approved.verificationLevel, 'STUDENT_VERIFIED')
      assert.match(approved.loginNameNormalized!, /^linzhixia\d{3}$/)
      assert.equal(
        (
          await http
            .post('/api/auth/login')
            .set('x-organization-id', org.id)
            .send({ username: oldUsername, password })
            .expect(200)
        ).body.user.id,
        userId,
      )
      const player = await db.playerProfile.create({
        data: {
          organizationId: org.id,
          displayName: '保留的球员显示名',
          studentRecordId,
          studentId: correctedNumber,
        },
      })
      await db.user.update({
        where: { id: userId },
        data: { playerProfileId: player.id, verificationLevel: 'PLAYER_CONFIRMED' },
      })
      mine = (await http.get('/api/me/campus/registration').set('authorization', token).expect(200))
        .body
      const nextNumber = number()
      await http
        .post('/api/me/campus/registration')
        .set('authorization', token)
        .set('Idempotency-Key', randomUUID())
        .send({
          expectedVersion: mine.items[0].version,
          realName: '林之夏',
          studentNumber: nextNumber,
          reason: '',
        })
        .expect(201)
      mine = (await http.get('/api/me/campus/registration').set('authorization', token).expect(200))
        .body
      const nextId = mine.items[0].id as string
      assert.notEqual(nextId, applicationId)
      const approve = { expectedVersion: 1, decision: 'APPROVE', reason: '核对更正且保留关联编号' }
      const replies = await Promise.all(
        [adminToken, adminTwoToken].map((auth) =>
          http
            .post('/api/admin/campus/registrations/' + nextId + '/review')
            .set('authorization', auth)
            .set('Idempotency-Key', randomUUID())
            .send(approve),
        ),
      )
      assert.deepEqual(replies.map((reply) => reply.status).sort(), [201, 409])
      approved = await db.user.findUniqueOrThrow({ where: { id: userId } })
      assert.equal(approved.studentRecordId, studentRecordId)
      assert.equal(approved.playerProfileId, player.id)
      assert.equal(approved.verificationLevel, 'PLAYER_CONFIRMED')
      const updatedPlayer = await db.playerProfile.findUniqueOrThrow({ where: { id: player.id } })
      assert.equal(updatedPlayer.displayName, '保留的球员显示名')
      assert.equal(updatedPlayer.studentId, nextNumber)
      const currentStudent = await db.studentRecord.findUniqueOrThrow({
        where: { id: studentRecordId },
      })
      assert.equal(currentStudent.realName, '林之夏')
      assert.equal(currentStudent.studentNumber, nextNumber)
      assert.equal(
        await db.identityApplication.count({ where: { id: applicationId, status: 'APPROVED' } }),
        1,
      )
      const owned = await db.identityApplication.create({
        data: {
          organizationId: org.id,
          userId: admin.id,
          kind: 'STUDENT_REGISTRATION',
          message: JSON.stringify({ realName: '虚构审核员', studentNumber: number() }),
        },
      })
      await http
        .post('/api/admin/campus/registrations/' + owned.id + '/review')
        .set('authorization', adminToken)
        .set('Idempotency-Key', randomUUID())
        .send(approve)
        .expect(403)
      assert.equal(
        (await db.identityApplication.findUniqueOrThrow({ where: { id: owned.id } })).status,
        'PENDING',
      )
    } finally {
      await app.close()
      await db.$disconnect()
      if (previousAudience === undefined) delete process.env.REGISTRATION_AUDIENCE
      else process.env.REGISTRATION_AUDIENCE = previousAudience
      if (previousEnabled === undefined) delete process.env.REGISTRATION_ENABLED
      else process.env.REGISTRATION_ENABLED = previousEnabled
    }
  },
)
