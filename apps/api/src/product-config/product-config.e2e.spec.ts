import 'reflect-metadata'
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { Controller, Get, Post, HttpStatus, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import request from 'supertest'
import { AuthService } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { configureApp } from '../app.setup'
import { PrismaService } from '../database/prisma.service'
import { ProductConfigModule } from './product-config.module'
import { ProductConfigService, buildProductConfiguration } from './product-config.service'
import type { Server } from 'node:http'

@Controller()
class BusinessProbeController {
  @Post('community/posts') retiredPost() {
    throw new Error('Retired post handler reached')
  }
  @Post('community/posts/:postId/comments') retiredComment() {
    throw new Error('Retired comment handler reached')
  }
  @Post('messages/direct/:recipientUserId') retiredMessage() {
    return { fixtureMessage: true }
  }
  @Get('me/notifications') notices() {
    return { items: [{ type: 'SYSTEM', title: '通知仍可读取' }] }
  }
  @Post('captain/teams/:teamId/lineup-plans/:planId/default') defaultLineup() {
    throw new Error('Closed teamManagement route must never reach a write handler')
  }
  @Post('captain/teams/:teamId/lineup-plans/:planId/confirm') confirmLineup() {
    throw new Error('Closed teamManagement route must never reach a write handler')
  }
  @Get('public/home') home() {
    return { fixture: true }
  }
  @Get('community/posts') posts() {
    return { items: [] }
  }
  @Get('health/live') health() {
    return { status: 'ok' }
  }
}

let app: INestApplication
let requireSessionCalls = 0
const org = '00000000-0000-4000-8000-000000000091'

before(async () => {
  const module = await Test.createTestingModule({
    imports: [ProductConfigModule],
    controllers: [BusinessProbeController],
  })
    .overrideProvider(AuthService)
    .useValue({
      requireSession: async () => {
        requireSessionCalls++
        throw new ApiHttpException(HttpStatus.UNAUTHORIZED, {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'session required',
        })
      },
    })
    .overrideProvider(PrismaService)
    .useValue({
      organization: {
        findFirst: async ({ where }: { where: { id: string } }) =>
          where.id === org ? { id: org } : null,
      },
    })
    .overrideProvider(ProductConfigService)
    .useValue({
      getConfiguration: () =>
        buildProductConfiguration({
          XIAOQIU_FEATURE_COMMUNITY: 'false',
          XIAOQIU_FEATURE_TEAM_MANAGEMENT: 'false',
        }),
    })
    .compile()
  app = module.createNestApplication()
  configureApp(app)
  await app.init()
  const server = app.getHttpServer() as Server
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
})
after(async () => {
  await app?.close()
})

test('explicitly disabled community is blocked while restored messaging and notifications remain reachable', async () => {
  for (const path of ['/api/community/posts', '/api/community/posts/post-1/comments'])
    await request(app.getHttpServer()).post(path).send({ body: 'must not be saved' }).expect(403)
  await request(app.getHttpServer())
    .post('/api/messages/direct/user-1')
    .send({ body: 'fixture' })
    .expect(201)
  const notices = await request(app.getHttpServer()).get('/api/me/notifications').expect(200)
  assert.equal(notices.body.items[0].type, 'SYSTEM')
})

test('anonymous product configuration and health return 200 without resolving an organization/session', async () => {
  const beforeCalls = requireSessionCalls
  const response = await request(app.getHttpServer())
    .get('/api/product/config')
    .set('x-dev-role', 'PLATFORM_ADMIN')
    .set('x-organization-id', 'invalid')
    .expect(200)
  assert.equal(response.body.accountRequired, false)
  assert.equal(response.body.serverGuestAccess, true)
  assert.equal(response.body.guest.enabled, true)
  assert.equal(response.headers['cache-control'], 'no-store')
  await request(app.getHttpServer()).get('/api/health/live').expect(200)
  assert.equal(requireSessionCalls, beforeCalls)
})

test('anonymous public reads stay open while capabilities and revoked sessions stay 401', async () => {
  await request(app.getHttpServer())
    .get('/api/public/home')
    .set('x-organization-id', org)
    .expect(200)
  await request(app.getHttpServer())
    .get('/api/me/capabilities')
    .set('x-organization-id', org)
    .expect(401)
  for (const path of ['/api/me/capabilities', '/api/public/home']) {
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer revoked-test-session')
      .set('x-dev-role', 'PLATFORM_ADMIN')
      .set('x-organization-id', org)
      .expect(401)
  }
})

test('closed module rejects an actual direct HTTP request with its stable reason', async () => {
  const response = await request(app.getHttpServer()).get('/api/community/posts/').expect(403)
  assert.equal(response.body.message, '功能暂未开放')
  assert.equal(response.body.details.module, 'community')
})

test('closed team management also blocks direct default and confirmation HTTP writes', async () => {
  for (const action of ['default', 'confirm']) {
    const response = await request(app.getHttpServer())
      .post(`/api/captain/teams/${org}/lineup-plans/${org}/${action}`)
      .send({ expectedVersion: 1 })
      .expect(403)
    assert.equal(response.body.message, '功能暂未开放')
    assert.equal(response.body.details.module, 'teamManagement')
  }
})
