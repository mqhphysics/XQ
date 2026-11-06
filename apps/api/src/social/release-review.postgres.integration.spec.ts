import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'

test(
  '0.8.8 registration claims, profile review, old notifications and organization isolation over real HTTP',
  { timeout: 60000 },
  async () => {
    const url = process.env.TEST_DATABASE_URL!
    assert.match(new URL(url).pathname, /_test_/)
    assert.notEqual(url, process.env.DATABASE_URL)
    const db = new PrismaClient({ datasources: { db: { url } } })
    const org = await db.organization.create({
      data: { slug: 'review-' + randomUUID(), name: 'FICTIONAL_TEST' },
    })
    const student = await db.studentRecord.create({
      data: { organizationId: org.id, realName: '虚构验收学生', status: 'ACTIVE' },
    })
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile()
    const app = module.createNestApplication()
    app.useLogger(false)
    configureApp(app)
    await app.init()
    const http = request(app.getHttpServer())
    try {
      const registration = await http
        .post('/api/auth/register')
        .set('x-organization-id', org.id)
        .send({
          realName: student.realName,
          studentId: '2026999988',
          password: 'Fictional-Review-088!',
        })
        .expect(201)
      const user = registration.body.user,
        token = 'Bearer ' + registration.body.accessToken
      assert.equal(user.verificationLevel, 'UNVERIFIED')
      assert.equal(
        (await db.studentRecord.findUniqueOrThrow({ where: { id: student.id } })).studentNumber,
        null,
      )
      assert.equal(
        await db.identityApplication.count({
          where: { userId: user.id, kind: 'STUDENT_REGISTRATION', status: 'PENDING' },
        }),
        1,
      )
      await http
        .patch('/api/auth/me')
        .set('authorization', token)
        .send({ displayName: '虚构公开昵称', bio: '用于隔离验收' })
        .expect(200)
      assert.equal(
        await db.contentReport.count({
          where: { organizationId: org.id, targetId: user.id, reason: '公开资料修改核查' },
        }),
        1,
      )
      await db.contentReport.createMany({
        data: Array.from({ length: 52 }, () => ({
          organizationId: org.id,
          reporterUserId: user.id,
          targetType: 'FEEDBACK' as const,
          reason: 'FICTIONAL history',
        })),
      })
      const reports = await http.get('/api/me/reports').set('authorization', token).expect(200)
      assert.equal(reports.body.items.length, 50)
      const reportTail = await http
        .get('/api/me/reports?before=' + reports.body.nextCursor)
        .set('authorization', token)
        .expect(200)
      assert.equal(reportTail.body.items.length, 3)
      const date = new Date('2026-11-01T01:00:00Z')
      await db.userNotification.createMany({
        data: Array.from({ length: 105 }, (_, i) => ({
          organizationId: org.id,
          recipientUserId: user.id,
          type: 'TEAM_APPLICATION_DECIDED' as const,
          title: 'FICTIONAL ' + i,
          createdAt: date,
        })),
      })
      const page = await http.get('/api/me/notifications').set('authorization', token).expect(200)
      assert.equal(page.body.items.length, 100)
      assert.equal(page.body.unreadCount, 105)
      assert(page.body.nextCursor)
      const older = await http
        .get('/api/me/notifications?before=' + page.body.nextCursor)
        .set('authorization', token)
        .expect(200)
      assert.equal(older.body.items.length, 5)
      const ids = new Set(
        [...page.body.items, ...older.body.items].map((item: { id: string }) => item.id),
      )
      assert.equal(ids.size, 105)
      const id = older.body.items[0].id
      await http
        .get('/api/me/notifications/' + id)
        .set('authorization', token)
        .expect(200)
      await http
        .put('/api/me/notifications/' + id + '/read')
        .set('authorization', token)
        .expect(200)
      assert(
        (
          await http
            .get('/api/me/notifications/' + id)
            .set('authorization', token)
            .expect(200)
        ).body.readAt,
      )
      await http
        .get('/api/me/notifications/' + randomUUID())
        .set('authorization', token)
        .expect(404)
      await http
        .get('/api/me/notifications?before=' + randomUUID())
        .set('authorization', token)
        .expect(404)
      await http.get('/api/me/notifications').expect(401)
      const otherOrg = await db.organization.create({
        data: { slug: 'other-' + randomUUID(), name: 'FICTIONAL_OTHER' },
      })
      const foreign = await db.userNotification.create({
        data: {
          organizationId: otherOrg.id,
          recipientUserId: user.id,
          type: 'TEAM_APPLICATION_DECIDED',
          title: 'FOREIGN',
        },
      })
      await http
        .get('/api/me/notifications/' + foreign.id)
        .set('authorization', token)
        .expect(404)
      await http.put('/api/me/notifications/read-all').set('authorization', token).expect(200)
      assert.equal(
        (await http.get('/api/me/notifications').set('authorization', token).expect(200)).body
          .unreadCount,
        0,
      )
      assert.equal(
        (await db.userNotification.findUniqueOrThrow({ where: { id: foreign.id } })).readAt,
        null,
      )
    } finally {
      await app.close()
      await db.$disconnect()
    }
  },
)
