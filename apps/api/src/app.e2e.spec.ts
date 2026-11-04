import assert from 'node:assert/strict'
import test, { after, afterEach, before } from 'node:test'

import { Body, Controller, Logger, Module, Post, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { IsString, Length } from 'class-validator'
import request from 'supertest'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { configureApp } from './app.setup'
import { PrismaService } from './database/prisma.service'

class ValidationProbeDto {
  @IsString()
  @Length(3, 20)
  name!: string
}

@Controller('test')
class ValidationProbeController {
  @Post('validation')
  validate(@Body() body: ValidationProbeDto): ValidationProbeDto {
    return body
  }
}

let databaseFailure = false
let databaseQueryCount = 0

@Module({
  controllers: [AppController, ValidationProbeController],
  providers: [
    AppService,
    {
      provide: PrismaService,
      useValue: {
        $queryRawUnsafe: async () => {
          databaseQueryCount += 1

          if (databaseFailure) {
            throw new Error('database unavailable')
          }

          return [{ result: 1 }]
        },
      },
    },
  ],
})
class TestAppModule {}

let app: INestApplication

before(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile()

  app = moduleRef.createNestApplication()
  configureApp(app)
  await app.init()
})

after(async () => {
  await app.close()
})

afterEach(() => {
  databaseFailure = false
  databaseQueryCount = 0
})

test('GET /api/health/live checks only the API process and propagates requestId', async () => {
  databaseFailure = true

  const response = await request(app.getHttpServer())
    .get('/api/health/live')
    .set('x-request-id', 'liveness-test-request')
    .expect(200)

  assert.equal(response.headers['x-request-id'], 'liveness-test-request')
  assert.equal(response.body.requestId, 'liveness-test-request')
  assert.equal(response.body.service, 'api')
  assert.equal(response.body.status, 'ok')
  assert.equal(response.body.database, undefined)
  assert.equal(databaseQueryCount, 0)
})

test('GET /api/health/ready checks PostgreSQL', async () => {
  const response = await request(app.getHttpServer())
    .get('/api/health/ready')
    .set('x-request-id', 'readiness-test-request')
    .expect(200)

  assert.equal(response.headers['x-request-id'], 'readiness-test-request')
  assert.equal(response.body.requestId, 'readiness-test-request')
  assert.equal(response.body.status, 'ok')
  assert.equal(response.body.database.status, 'ok')
  assert.equal(typeof response.body.database.latencyMs, 'number')
  assert.equal(databaseQueryCount, 1)
})

test('GET /api/health remains a readiness-compatible endpoint', async () => {
  const response = await request(app.getHttpServer())
    .get('/api/health')
    .set('x-request-id', 'health-alias-request')
    .expect(200)

  assert.equal(response.headers['x-request-id'], 'health-alias-request')
  assert.equal(response.body.requestId, 'health-alias-request')
  assert.equal(response.body.status, 'ok')
  assert.equal(response.body.database.status, 'ok')
  assert.equal(typeof response.body.database.latencyMs, 'number')
  assert.equal(databaseQueryCount, 1)
})

test('GET /api/health/ready returns 503 when PostgreSQL is unavailable', async () => {
  databaseFailure = true

  const response = await request(app.getHttpServer())
    .get('/api/health/ready')
    .set('x-request-id', 'readiness-down-request')
    .expect(503)

  assert.equal(response.headers['x-request-id'], 'readiness-down-request')
  assert.equal(response.body.requestId, 'readiness-down-request')
  assert.equal(response.body.code, ERROR_CODES.SERVICE_UNAVAILABLE)
  assert.equal(response.body.message, '数据库连接不可用')
  assert.equal(response.body.details.database.status, 'down')
  assert.equal(typeof response.body.details.database.latencyMs, 'number')
})

test('validation errors use the unified error response', async () => {
  const response = await request(app.getHttpServer())
    .post('/api/test/validation')
    .send({ name: 'x', unexpected: true })
    .expect(400)

  assert.equal(response.body.code, ERROR_CODES.VALIDATION_FAILED)
  assert.equal(response.body.message, '请求参数校验失败')
  assert.equal(response.body.requestId, response.headers['x-request-id'])
  assert.ok(Array.isArray(response.body.details.errors))
  assert.ok(response.body.details.errors.length >= 1)
})

test('framework errors use the unified error response', async () => {
  const response = await request(app.getHttpServer()).get('/api/not-found').expect(404)

  assert.equal(response.body.code, ERROR_CODES.NOT_FOUND)
  assert.equal(response.body.message, '资源不存在')
  assert.equal(response.body.requestId, response.headers['x-request-id'])
})

test('OpenAPI JSON is available at the stable endpoint', async () => {
  const response = await request(app.getHttpServer()).get('/api/openapi.json').expect(200)

  assert.equal(response.body.info.title, '晓球 API')
  assert.ok(response.body.paths['/api/health'])
  assert.ok(response.body.paths['/api/health/live'])
  assert.ok(response.body.paths['/api/health/ready'])
  assert.ok(response.body.paths['/api/health'].get.responses['503'])
  assert.ok(response.body.paths['/api/health/ready'].get.responses['503'])
  assert.deepEqual(
    [...response.body.components.schemas.ApiErrorResponseDto.properties.code.enum].sort(),
    Object.values(ERROR_CODES).sort(),
  )
})

test('request and exception logs exclude sensitive query parameters', async () => {
  databaseFailure = true
  const capturedLogs: string[] = []
  const loggerPrototype = Logger.prototype as unknown as {
    error: (...args: unknown[]) => void
    log: (...args: unknown[]) => void
  }
  const originalError = loggerPrototype.error
  const originalLog = loggerPrototype.log

  loggerPrototype.error = (...args: unknown[]) => {
    capturedLogs.push(args.map(String).join(' '))
  }
  loggerPrototype.log = (...args: unknown[]) => {
    capturedLogs.push(args.map(String).join(' '))
  }

  try {
    await request(app.getHttpServer())
      .get(
        '/api/health/ready?access_token=secret-token-value&phone=13800138000&student_number=2026123456',
      )
      .expect(503)
  } finally {
    loggerPrototype.error = originalError
    loggerPrototype.log = originalLog
  }

  const output = capturedLogs.join('\n')

  assert.match(output, /"path":"\/api\/health\/ready"/)

  for (const sensitiveValue of [
    'access_token',
    'secret-token-value',
    'phone',
    '13800138000',
    'student_number',
    '2026123456',
  ]) {
    assert.equal(output.includes(sensitiveValue), false)
  }
})
