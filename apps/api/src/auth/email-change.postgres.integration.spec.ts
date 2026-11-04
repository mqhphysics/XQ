import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'
import { hashPassword } from './password'
import { EmailCodeService } from './email-code.service'
import { MailService, type EmailPurpose } from './mail.service'

// Records external mail only; real HTTP, authentication and PostgreSQL remain active.
class ChangeTestMail extends MailService {
  configured = true
  fail = false
  messages: Array<{ email: string; code: string; purpose: EmailPurpose }> = []
  override get enabled() {
    return true
  }
  override requireConfigured() {
    if (!this.configured) return super.requireConfigured()
    return 'FICTIONAL_TEST_EMAIL_CHANGE_SECRET_32_CHARS'
  }
  override async sendCode(email: string, code: string, purpose: EmailPurpose) {
    if (this.fail) throw new Error('FICTIONAL_SEND_FAILURE')
    this.messages.push({ email, code, purpose })
  }
}

test(
  'email change verifies old then new, scopes codes to session and atomically binds',
  { timeout: 60000 },
  async (t) => {
    assert.ok(process.env.TEST_DATABASE_URL)
    assert.match(new URL(process.env.TEST_DATABASE_URL).pathname, /^\/xiaoqiu_email_test_/)
    const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }),
      mail = new ChangeTestMail()
    const suffix = randomUUID().slice(0, 8),
      password = 'Fictional-email-change-2026!'
    const org = await db.organization.create({
      data: { slug: 'change-' + suffix, name: 'FICTIONAL_TEST 邮箱换绑' },
    })
    const otherOrg = await db.organization.create({
      data: { slug: 'other-change-' + suffix, name: 'FICTIONAL_TEST 其他组织' },
    })
    const old = `old-${suffix}@example.test`,
      target = `new-${suffix}@example.test`,
      occupied = `occupied-${suffix}@example.test`
    const createUser = async (name: string, email: string | null, orgId = org.id) => {
      const digest = hashPassword(password)
      return db.user.create({
        data: {
          loginNameNormalized: `change-${suffix}-${name}`,
          displayName: 'FICTIONAL_TEST ' + name,
          bio: 'FICTIONAL_TEST 原简介',
          email,
          emailNormalized: email,
          status: 'ACTIVE',
          memberships: { create: { organizationId: orgId, status: 'ACTIVE' } },
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
    const owner = await createUser('owner', old),
      foreign = await createUser('foreign', `foreign-${suffix}@example.test`, otherOrg.id)
    await createUser('occupied', occupied)
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(MailService)
      .useValue(mail)
      .compile()
    const app = module.createNestApplication({ logger: false })
    configureApp(app)
    await app.init()
    t.after(async () => {
      await app.close()
      await db.$disconnect()
    })
    const http = request(app.getHttpServer()),
      codes = app.get(EmailCodeService)
    const login = async (name: string, orgId = org.id) =>
      (
        await http
          .post('/api/auth/login')
          .set('x-organization-id', orgId)
          .send({ username: `change-${suffix}-${name}`, password })
          .expect(200)
      ).body.accessToken as string
    const token = await login('owner'),
      otherSession = await login('owner'),
      foreignToken = await login('foreign', otherOrg.id)
    const post = (path: string, body: object, bearer = token) =>
      http
        .post('/api/auth/email/change/' + path)
        .set('Authorization', 'Bearer ' + bearer)
        .send(body)
    const me = (bearer = token) => http.get('/api/auth/me').set('Authorization', 'Bearer ' + bearer)
    let flowId = '',
      oldCode = '',
      newCode = ''
    await t.test(
      'requires login and public profile PATCH cannot replace or clear email',
      async () => {
        await http.post('/api/auth/email/change/start').send({}).expect(401)
        await http
          .patch('/api/auth/me')
          .set('Authorization', 'Bearer ' + token)
          .send({ displayName: 'FICTIONAL_TEST 新昵称', email: target })
          .expect(409)
        await http
          .patch('/api/auth/me')
          .set('Authorization', 'Bearer ' + token)
          .send({ email: null })
          .expect(400)
        await http
          .patch('/api/auth/me')
          .set('Authorization', 'Bearer ' + token)
          .send({ displayName: 'FICTIONAL_TEST 新昵称' })
          .expect(200)
          .then((r) => {
            assert.equal(r.body.bio, 'FICTIONAL_TEST 原简介')
            assert.equal(r.body.email, old)
          })
        const start = await post('start', {}).expect(200)
        flowId = start.body.id
        assert.equal(start.body.stage, 'OLD_EMAIL')
        await post('start', {})
          .expect(200)
          .then((r) => assert.equal(r.body.id, flowId))
      },
    )
    await t.test(
      'rejects new binding before old verification and foreign/session flow access',
      async () => {
        await post('code', { changeId: flowId, newEmail: target }).expect(409)
        await post('complete', { changeId: flowId, emailCode: '123456' }).expect(409)
        await post('code', { changeId: flowId }, foreignToken).expect(409)
        await post('code', { changeId: flowId }, otherSession).expect(409)
        await post('code', { changeId: flowId }).expect(202)
        await codes.onModuleDestroy()
        oldCode = mail.messages.find(
          (m) => m.email === old && m.purpose === 'CHANGE_EMAIL_OLD',
        )!.code
        const second = await post('start', {}, otherSession).expect(200)
        await post(
          'verify-old',
          { changeId: second.body.id, emailCode: oldCode },
          otherSession,
        ).expect(400)
        await post('verify-old', {
          changeId: flowId,
          emailCode: oldCode === '000000' ? '000001' : '000000',
        }).expect(400)
      },
    )
    await t.test(
      'old verification advances the flow while preserving the previous binding',
      async () => {
        await post('verify-old', { changeId: flowId, emailCode: oldCode })
          .expect(200)
          .then((r) => assert.equal(r.body.stage, 'NEW_EMAIL'))
        await me()
          .expect(200)
          .then((r) => assert.equal(r.body.email, old))
        await post('code', { changeId: flowId, newEmail: occupied }).expect(409)
        await post('code', { changeId: flowId, newEmail: target }).expect(202)
        await codes.onModuleDestroy()
        newCode = mail.messages.find(
          (m) => m.email === target && m.purpose === 'CHANGE_EMAIL_NEW',
        )!.code
        await post('complete', { changeId: flowId, emailCode: oldCode }).expect(400)
        await me()
          .expect(200)
          .then((r) => assert.equal(r.body.email, old))
      },
    )
    await t.test(
      'concurrent completion is idempotent, audits once and revokes other sessions',
      async () => {
        const responses = await Promise.all([
          post('complete', { changeId: flowId, emailCode: newCode }),
          post('complete', { changeId: flowId, emailCode: newCode }),
        ])
        assert.deepEqual(
          responses.map((r) => r.status),
          [200, 200],
        )
        for (const response of responses) {
          assert.equal(response.body.email, target)
          assert.ok(response.body.emailVerifiedAt)
        }
        await me(otherSession).expect(401)
        await me().expect(200)
        assert.equal(
          await db.auditLog.count({
            where: { actorUserId: owner.id, action: 'EMAIL_BINDING_CHANGED' },
          }),
          1,
        )
        assert.equal(
          await db.userNotification.count({
            where: { recipientUserId: owner.id, deduplicationKey: 'email-changed:' + flowId },
          }),
          1,
        )
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: foreign.id } })).email,
          `foreign-${suffix}@example.test`,
        )
      },
    )
    await t.test(
      'expired flow and failed or unconfigured mail never change a binding',
      async () => {
        const next = await post('start', {}).expect(200)
        await db.emailChangeRequest.update({
          where: { id: next.body.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        })
        await post('code', { changeId: next.body.id }).expect(409)
        await createUser('empty', null)
        const empty = await login('empty'),
          fresh = await post('start', {}, empty).expect(200)
        assert.equal(fresh.body.stage, 'NEW_EMAIL')
        mail.fail = true
        const failedEmail = `failed-${suffix}@example.test`
        await post('code', { changeId: fresh.body.id, newEmail: failedEmail }, empty).expect(202)
        await codes.onModuleDestroy()
        assert.equal(
          (await db.emailAuthCode.findFirstOrThrow({ where: { contextId: fresh.body.id } }))
            .sendStatus,
          'FAILED',
        )
        await post('complete', { changeId: fresh.body.id, emailCode: '123456' }, empty).expect(400)
        await me(empty)
          .expect(200)
          .then((r) => assert.equal(r.body.email, null))
        mail.fail = false
        mail.configured = false
        await post(
          'code',
          { changeId: fresh.body.id, newEmail: `unconfigured-${suffix}@example.test` },
          empty,
        ).expect(503)
      },
    )
  },
)
