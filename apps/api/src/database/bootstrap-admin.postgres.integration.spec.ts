import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import request from 'supertest'

import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaService } from './prisma.service'
import { PrismaClient } from '../generated/prisma/client'
import { bootstrapAdmin } from './bootstrap-admin'

test('bootstrap creates a real first administrator and never resets accounts or grants platform messaging', async () => {
  const url = process.env.TEST_DATABASE_URL
  assert.ok(url, 'Bootstrap integration requires an isolated TEST_DATABASE_URL')
  assert.match(new URL(url).pathname, /(?:^|_)(?:test|ci)(?:_|$)/)
  assert.notEqual(url, process.env.DATABASE_URL)
  const prisma = new PrismaClient({ datasources: { db: { url } } })
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const input = {
    organizationCode: `bootstrap-${suffix}`,
    organizationName: 'FICTIONAL_TEST 初始化组织',
    username: `bootstrap-${suffix}`,
    displayName: 'FICTIONAL_TEST 管理员',
    password: `Bootstrap-Test-${suffix}!`,
  }
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile()
  const app = module.createNestApplication({ logger: false })
  configureApp(app)
  try {
    await app.init()
    await assert.rejects(bootstrapAdmin(prisma, { ...input, password: 'short' }), /初始化密码/)
    assert.equal(await prisma.organization.count({ where: { slug: input.organizationCode } }), 0)
    const created = await bootstrapAdmin(prisma, input)
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-organization-id', created.organizationId)
      .send({ username: input.username, password: input.password })
      .expect(200)
    const auth = `Bearer ${login.body.accessToken}`
    assert.deepEqual(login.body.user.roles, [
      { role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: created.organizationId },
    ])
    await request(app.getHttpServer())
      .get('/api/admin/center/overview')
      .set('authorization', auth)
      .expect(200)
    const messages = await request(app.getHttpServer())
      .get('/api/messages/conversations')
      .set('authorization', auth)
      .expect(200)
    assert.equal(messages.body.canSend, false)
    const credential = await prisma.passwordCredential.findUniqueOrThrow({
      where: { userId: created.userId },
    })
    assert.notEqual(credential.passwordHash, input.password)
    await assert.rejects(
      bootstrapAdmin(prisma, { ...input, password: 'Different-Password-2026!' }),
      /已有管理员/,
    )
    assert.deepEqual(
      await prisma.passwordCredential.findUniqueOrThrow({ where: { userId: created.userId } }),
      credential,
    )
    await assert.rejects(
      bootstrapAdmin(prisma, { ...input, organizationCode: `${input.organizationCode}-other` }),
      /用户名已存在/,
    )
    assert.equal(
      await prisma.organization.count({ where: { slug: `${input.organizationCode}-other` } }),
      0,
    )
    const logs = await prisma.auditLog.findMany({
      where: { organizationId: created.organizationId, action: 'BOOTSTRAP_ORGANIZATION_ADMIN' },
    })
    assert.equal(logs.length, 1)
    assert.equal(JSON.stringify(logs).includes(input.password), false)
    assert.equal(logs[0]!.source, 'BOOTSTRAP_CLI')
  } finally {
    await app.close()
    await prisma.$disconnect()
  }
})
