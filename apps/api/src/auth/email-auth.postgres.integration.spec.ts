import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaService } from '../database/prisma.service'
import { hashPassword } from './password'
import { EmailCodeService } from './email-code.service'
import { MailService, type EmailPurpose } from './mail.service'

// External SMTP is a recording adapter here, never evidence of QQ delivery.
class RecordingMail extends MailService {
  fail = false
  configured = true
  messages: Array<{ email: string; code: string; purpose: EmailPurpose }> = []
  notices: string[] = []
  override get enabled() {
    return true
  }
  override requireConfigured() {
    if (!this.configured) return super.requireConfigured()
    return 'FICTIONAL_TEST_EMAIL_SECRET_32_CHARACTERS'
  }
  override async sendCode(email: string, code: string, purpose: EmailPurpose) {
    if (this.fail) throw new Error('FICTIONAL_SMTP_FAILURE')
    this.messages.push({ email, code, purpose })
  }
  override async sendPasswordChanged(email: string) {
    this.notices.push(email)
  }
}

test(
  'email authentication uses isolated PostgreSQL and real HTTP; external SMTP is recorded',
  { timeout: 90_000 },
  async (t) => {
    assert.ok(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL is required; no silent skip')
    const url = new URL(process.env.TEST_DATABASE_URL)
    assert.match(
      url.pathname,
      /^\/xiaoqiu_email_test(?:_|$)/,
      'Use the dedicated email test database',
    )
    if (process.env.DATABASE_URL)
      assert.notEqual(url.pathname, new URL(process.env.DATABASE_URL).pathname)
    const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } })
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const mail = new RecordingMail()
    let app: INestApplication | undefined
    let orgId = ''
    let otherId = ''
    const userIds: string[] = []
    try {
      orgId = (
        await prisma.organization.create({
          data: { slug: `email-test-${suffix}`, name: 'FICTIONAL_TEST 邮箱认证' },
        })
      ).id
      otherId = (
        await prisma.organization.create({
          data: { slug: `email-other-${suffix}`, name: 'FICTIONAL_TEST 另一组织' },
        })
      ).id
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .overrideProvider(MailService)
        .useValue(mail)
        .compile()
      app = module.createNestApplication({ logger: false })
      configureApp(app)
      await app.init()
      const api = request(app.getHttpServer())
      const codes = app.get(EmailCodeService)
      const email = `new-${suffix}@example.test`
      const input = {
        username: `mail-${suffix}`,
        displayName: '虚构邮箱测试',
        realName: '虚构姓名',
        studentId: String(Date.now()).slice(-10),
        email,
        password: 'Fictional-email-password!',
      }
      const post = (path: string, body: object, token?: string, organizationId = orgId) => {
        const req = api
          .post(`/api/auth/${path}`)
          .set('x-organization-id', organizationId)
          .send(body)
        return token ? req.set('Authorization', `Bearer ${token}`) : req
      }
      const codeFor = async (target: string, purpose: EmailPurpose, token?: string) => {
        // Advance only this test mailbox's cooldown; expiry and attempts remain real.
        await prisma.emailAuthCode.updateMany({
          where: { organizationId: orgId, emailNormalized: target },
          data: { createdAt: new Date(Date.now() - 61_000) },
        })
        const response = await post('email/code', { email: target, purpose }, token)
        assert.equal(response.status, 202, response.text)
        assert.equal('code' in response.body, false)
        await codes.onModuleDestroy()
        const sent = mail.messages
          .filter((row) => row.email === target && row.purpose === purpose)
          .at(-1)
        assert.ok(sent)
        return sent.code
      }

      await t.test(
        'optional email registration creates independent unbound accounts and real sessions',
        async () => {
          const sentBefore = mail.messages.length
          for (const [index, optionalEmail] of [undefined, '   '].entries()) {
            const response = await post('register', {
              ...input,
              username: `no-mail-${index}-${suffix}`,
              studentId: `88${String(Date.now()).slice(-7)}${index}`,
              email: optionalEmail,
            })
            assert.equal(response.status, 201, response.text)
            userIds.push(response.body.user.id)
            assert.equal(response.body.user.email, null)
            assert.equal(response.body.user.emailVerifiedAt, null)
            assert.equal(response.body.user.username, `no-mail-${index}-${suffix}`)
            const stored = await prisma.user.findUniqueOrThrow({
              where: { id: response.body.user.id },
            })
            assert.equal(stored.emailNormalized, null)
            const me = await api
              .get('/api/auth/me')
              .set('Authorization', `Bearer ${response.body.accessToken}`)
              .set('x-organization-id', orgId)
            assert.equal(me.status, 200, me.text)
            assert.equal(me.body.id, stored.id)
          }
          assert.equal(mail.messages.length, sentBefore)
          assert.equal(await prisma.emailAuthCode.count({ where: { organizationId: orgId } }), 0)
          assert.equal((await post('register', { ...input, email: 'bad-email' })).status, 400)
          assert.equal(
            (await post('register', { ...input, email: '', studentId: '123' })).status,
            400,
          )
        },
      )

      await t.test(
        'six arbitrary password characters register and log in through real HTTP',
        async () => {
          for (const [index, password] of [
            '123456',
            'abcdef',
            '......',
            '中文密码六个',
            '😀😀😀😀😀😀',
            '      ',
          ].entries()) {
            const username = `six-${index}-${suffix}`
            const response = await post('register', {
              ...input,
              username,
              studentId: `77${String(Date.now()).slice(-7)}${index}`,
              email: '',
              password,
            })
            assert.equal(response.status, 201, response.text)
            userIds.push(response.body.user.id)
            const loggedIn = await post('login', { username, password })
            assert.equal(loggedIn.status, 200, loggedIn.text)
            assert.equal(loggedIn.body.user.id, response.body.user.id)
          }
          assert.equal(
            (await post('register', { ...input, email: '', password: '12345' })).status,
            400,
          )
        },
      )

      await t.test('invalid organization and missing registration code are rejected', async () => {
        assert.equal(
          (await post('email/code', { email, purpose: 'REGISTER' }, undefined, randomUUID()))
            .status,
          404,
        )
        assert.equal((await post('register', input)).status, 400)
        assert.equal(await prisma.user.count({ where: { emailNormalized: email } }), 0)
      })
      const registrationCode = await codeFor(email, 'REGISTER')
      await t.test('cooldown, digest storage, purpose and organization isolation', async () => {
        assert.equal((await post('email/code', { email, purpose: 'REGISTER' })).status, 429)
        const row = await prisma.emailAuthCode.findFirstOrThrow({
          where: { organizationId: orgId, emailNormalized: email },
        })
        assert.notEqual(row.codeDigest, registrationCode)
        assert.equal(row.codeDigest.length, 64)
        assert.equal(
          (await post('email/login', { email, emailCode: registrationCode })).status,
          400,
        )
        assert.equal(
          (await post('register', { ...input, emailCode: registrationCode }, undefined, otherId))
            .status,
          400,
        )
      })
      const registration = await post('register', { ...input, emailCode: registrationCode })
      assert.equal(registration.status, 201, registration.text)
      const userId: string = registration.body.user.id
      userIds.push(userId)
      let token: string = registration.body.accessToken
      await t.test('verified registration is atomic and code cannot be reused', async () => {
        assert.ok(registration.body.user.emailVerifiedAt)
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).verificationLevel,
          'UNVERIFIED',
        )
        const row = await prisma.emailAuthCode.findFirstOrThrow({
          where: { emailNormalized: email },
        })
        assert.ok(row.consumedAt)
        assert.equal(
          (
            await post('register', {
              ...input,
              username: `${input.username}-2`,
              studentId: '8999999991',
              emailCode: registrationCode,
            })
          ).status,
          409,
        )
      })
      await t.test('concurrent email login consumes code once', async () => {
        const code = await codeFor(email, 'LOGIN')
        const responses = await Promise.all([
          post('email/login', { email, emailCode: code }),
          post('email/login', { email, emailCode: code }),
        ])
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400])
        token = responses.find((r) => r.status === 200)!.body.accessToken
      })
      await t.test('five wrong attempts commit, then correct code is rejected', async () => {
        const code = await codeFor(email, 'RESET_PASSWORD')
        const wrong = code === '000000' ? '000001' : '000000'
        for (let i = 0; i < 5; i++)
          assert.equal(
            (
              await post('password/reset-by-email', {
                email,
                emailCode: wrong,
                newPassword: 'Fictional-new-password!',
              })
            ).status,
            400,
          )
        assert.equal(
          (
            await post('password/reset-by-email', {
              email,
              emailCode: code,
              newPassword: 'Fictional-new-password!',
            })
          ).status,
          400,
        )
        assert.equal(
          (
            await prisma.emailAuthCode.findFirstOrThrow({
              where: { emailNormalized: email, purpose: 'RESET_PASSWORD' },
              orderBy: { createdAt: 'desc' },
            })
          ).attempts,
          5,
        )
      })
      await t.test('expired codes fail and password reset revokes every old session', async () => {
        const expired = await codeFor(email, 'RESET_PASSWORD')
        await prisma.emailAuthCode.updateMany({
          where: { emailNormalized: email, purpose: 'RESET_PASSWORD', consumedAt: null },
          data: { expiresAt: new Date(Date.now() - 1000) },
        })
        assert.equal(
          (
            await post('password/reset-by-email', {
              email,
              emailCode: expired,
              newPassword: 'Fictional-new-password!',
            })
          ).status,
          400,
        )
        const code = await codeFor(email, 'RESET_PASSWORD')
        assert.equal(
          (
            await post('password/reset-by-email', {
              email,
              emailCode: expired,
              newPassword: 'Fictional-new-password!',
            })
          ).status,
          400,
        )
        assert.equal(
          (
            await post('password/reset-by-email', {
              email,
              emailCode: code,
              newPassword: 'Fictional-new-password!',
            })
          ).status,
          204,
        )
        assert.equal(
          (await api.get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status,
          401,
        )
        assert.equal(await prisma.userSession.count({ where: { userId, revokedAt: null } }), 0)
        assert.equal(
          (await post('login', { username: input.username, password: input.password })).status,
          401,
        )
        const logged = await post('login', {
          username: input.username,
          password: 'Fictional-new-password!',
        })
        assert.equal(logged.status, 200)
        token = logged.body.accessToken
        assert.ok(mail.notices.includes(email))
        assert.equal(
          await prisma.auditLog.count({
            where: { organizationId: orgId, action: 'SELF_PASSWORD_RESET' },
          }),
          1,
        )
      })
      const legacyEmail = `legacy-${suffix}@example.test`
      const credential = hashPassword('Fictional-legacy-password!')
      const legacy = await prisma.user.create({
        data: {
          loginNameNormalized: `legacy-${suffix}`,
          displayName: '虚构旧账号',
          email: legacyEmail,
          emailNormalized: legacyEmail,
          memberships: { create: { organizationId: orgId, status: 'ACTIVE' } },
          passwordCredential: {
            create: {
              passwordHash: credential.hash,
              passwordSalt: credential.salt,
              algorithm: credential.algorithm,
            },
          },
        },
      })
      userIds.push(legacy.id)
      await t.test(
        'unverified legacy and unknown accounts have identical responses and no email',
        async () => {
          const count = mail.messages.length
          const unverified = await post('email/code', {
            email: legacyEmail,
            purpose: 'RESET_PASSWORD',
          })
          const unknown = await post('email/code', {
            email: `unknown-${suffix}@example.test`,
            purpose: 'RESET_PASSWORD',
          })
          assert.equal(unverified.status, 202)
          assert.deepEqual(unverified.body, unknown.body)
          await codes.onModuleDestroy()
          assert.equal(mail.messages.length, count)
          assert.equal(
            (await post('email/code', { email: legacyEmail, purpose: 'VERIFY_EMAIL' })).status,
            401,
          )
        },
      )
      await t.test(
        'password login verifies current email; profile PATCH cannot bypass email change verification',
        async () => {
          const logged = await post('login', {
            username: legacy.loginNameNormalized,
            password: 'Fictional-legacy-password!',
          })
          assert.equal(logged.status, 200)
          const legacyToken: string = logged.body.accessToken
          const code = await codeFor(legacyEmail, 'VERIFY_EMAIL', legacyToken)
          assert.equal(
            (await post('email/verify', { email: legacyEmail, emailCode: code }, token)).status,
            400,
          )
          const result = await post(
            'email/verify',
            { email: legacyEmail, emailCode: code },
            legacyToken,
          )
          assert.equal(result.status, 200, result.text)
          assert.ok(result.body.emailVerifiedAt)
          const update = await api
            .patch('/api/auth/me')
            .set('Authorization', `Bearer ${legacyToken}`)
            .send({
              displayName: '虚构旧账号',
              email: `replacement-${suffix}@example.test`,
              bio: '',
            })
          assert.equal(update.status, 409)
          const unchanged = await api
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${legacyToken}`)
          assert.equal(unchanged.body.email, legacyEmail)
          assert.ok(unchanged.body.emailVerifiedAt)
        },
      )
      await t.test(
        'send failure produces FAILED state and cannot register; missing configuration is 503',
        async () => {
          mail.fail = true
          const target = `fail-${suffix}@example.test`
          assert.equal(
            (await post('email/code', { email: target, purpose: 'REGISTER' })).status,
            202,
          )
          await codes.onModuleDestroy()
          assert.equal(
            (await prisma.emailAuthCode.findFirstOrThrow({ where: { emailNormalized: target } }))
              .sendStatus,
            'FAILED',
          )
          assert.equal(
            (
              await post('register', {
                ...input,
                email: target,
                username: `fail-${suffix}`,
                studentId: '8999999992',
                emailCode: '123456',
              })
            ).status,
            400,
          )
          mail.configured = false
          assert.equal(
            (
              await post('email/code', {
                email: `missing-${suffix}@example.test`,
                purpose: 'REGISTER',
              })
            ).status,
            503,
          )
        },
      )
      await t.test(
        'resends after sixty seconds have no email, IP or global hourly count cap',
        async () => {
          mail.fail = false
          mail.configured = true
          await prisma.emailAuthCode.updateMany({
            where: { emailNormalized: email },
            data: { createdAt: new Date(Date.now() - 61_000) },
          })
          assert.equal((await post('email/code', { email, purpose: 'LOGIN' })).status, 202)
          assert.equal((await post('email/code', { email, purpose: 'LOGIN' })).status, 429)
          const rows = Array.from({ length: 200 }, (_, i) => ({
            id: randomUUID(),
            organizationId: orgId,
            emailNormalized: `rate-${i}-${suffix}@example.test`,
            purpose: 'REGISTER',
            codeDigest: '0'.repeat(64),
            expiresAt: new Date(Date.now() + 300_000),
            ipAddress: i < 20 ? '192.0.2.11' : '192.0.2.12',
            sendStatus: 'SUPPRESSED',
          }))
          try {
            await prisma.emailAuthCode.createMany({ data: rows.slice(0, 20) })
            assert.equal(
              (
                await codes.requestCode(`ip-${suffix}@example.test`, 'REGISTER', orgId, {
                  ip: '192.0.2.11',
                  requestId: randomUUID(),
                })
              ).accepted,
              true,
            )
            await prisma.emailAuthCode.createMany({ data: rows.slice(20) })
            assert.equal(
              (
                await codes.requestCode(`global-${suffix}@example.test`, 'REGISTER', orgId, {
                  ip: '192.0.2.13',
                  requestId: randomUUID(),
                })
              ).accepted,
              true,
            )
          } finally {
            await prisma.emailAuthCode.deleteMany({
              where: { id: { in: rows.map((row) => row.id) } },
            })
          }
        },
      )
    } finally {
      if (app) await app.close()
      await prisma.auditLog.deleteMany({
        where: { organizationId: { in: [orgId, otherId].filter(Boolean) } },
      })
      await prisma.emailAuthCode.deleteMany({
        where: { organizationId: { in: [orgId, otherId].filter(Boolean) } },
      })
      await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } })
      await prisma.passwordCredential.deleteMany({ where: { userId: { in: userIds } } })
      await prisma.organizationMembership.deleteMany({ where: { userId: { in: userIds } } })
      await prisma.user.deleteMany({ where: { id: { in: userIds } } })
      await prisma.organization.deleteMany({
        where: { id: { in: [orgId, otherId].filter(Boolean) } },
      })
      await prisma.$disconnect()
    }
  },
)
