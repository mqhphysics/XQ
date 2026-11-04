import assert from 'node:assert/strict'
import test from 'node:test'

import { HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common'
import { ERROR_CODES, type ApiErrorResponse } from '@xiaoqiu/contracts'

import { ApiExceptionFilter } from './api-exception.filter'
import { ApiHttpException } from './api-http.exception'

const sensitive = {
  person: 'FICTIONAL_PRIVATE_STUDENT@example.invalid',
  token: 'Bearer FICTIONAL_PRIVATE_TOKEN',
  query: 'SELECT FICTIONAL_PRIVATE_COLUMN FROM fictional_students',
  parameter: 'FICTIONAL_PRIVATE_QUERYSTRING',
}

function captureResponse(exception: unknown, route: unknown = { path: '/api/reports/:reportId' }) {
  let status: number | undefined
  let body: ApiErrorResponse | undefined
  const response = {
    status(value: number) {
      status = value
      return response
    },
    json(value: ApiErrorResponse) {
      body = value
      return response
    },
  }
  const request = {
    requestId: 'fictional-error-request',
    method: 'POST',
    path: `/api/reports/${sensitive.person}`,
    originalUrl: `/api/reports/${sensitive.person}?email=${sensitive.parameter}`,
    headers: { authorization: sensitive.token },
    body: { student: sensitive.person },
    route,
  }
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost

  new ApiExceptionFilter().catch(exception, host)
  assert.ok(body)
  return { status, body }
}

function assertNoPrivateValues(value: unknown) {
  const text = JSON.stringify(value)
  for (const sentinel of Object.values(sensitive)) {
    assert.equal(text.includes(sentinel), false, `must not expose ${sentinel}`)
  }
}

test('unexpected database failures log only stable fields and approved codes, never query or stack', (t) => {
  const calls: unknown[][] = []
  t.mock.method(Logger.prototype, 'error', (...args: unknown[]) => calls.push(args))
  const exception = Object.assign(new Error(Object.values(sensitive).join(' ')), {
    code: 'P2010',
    meta: { code: '55000', message: sensitive.person, query: sensitive.query },
  })
  exception.stack = `Error: ${sensitive.person}\n${sensitive.query}\n${sensitive.token}`

  const result = captureResponse(exception)

  assert.equal(result.status, HttpStatus.INTERNAL_SERVER_ERROR)
  assert.deepEqual(result.body, {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: '服务器内部错误',
    requestId: 'fictional-error-request',
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.length, 1, 'no free-form stack argument is logged')
  assert.deepEqual(JSON.parse(calls[0]![0] as string), {
    code: ERROR_CODES.INTERNAL_ERROR,
    method: 'POST',
    path: '/api/reports/:reportId',
    requestId: 'fictional-error-request',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    internalCodes: ['P2010', '55000'],
  })
  assertNoPrivateValues({ result, calls })
})

test('internal code allowlist accepts PostgreSQL and Prisma codes without treating arbitrary text as codes', (t) => {
  const calls: unknown[][] = []
  t.mock.method(Logger.prototype, 'error', (...args: unknown[]) => calls.push(args))
  for (const code of ['P2002', '23505', '40001', 'XX000', 'P0001', 'HV00L', 'F0000']) {
    captureResponse(Object.assign(new Error(sensitive.query), { code }))
    assert.deepEqual(JSON.parse(calls.at(-1)![0] as string).internalCodes, [code])
  }
  for (const code of [
    sensitive.token,
    sensitive.person,
    'TOKEN',
    'P2002\n',
    '23505:query',
    23505,
  ]) {
    captureResponse(Object.assign(new Error(sensitive.query), { code }))
    assert.equal('internalCodes' in JSON.parse(calls.at(-1)![0] as string), false)
  }
  assertNoPrivateValues(calls)
})

test('an unmatched route and unknown HTTP error cannot echo request paths or exception bodies', (t) => {
  const calls: unknown[][] = []
  t.mock.method(Logger.prototype, 'error', (...args: unknown[]) => calls.push(args))
  for (const exception of [
    new HttpException(
      { message: sensitive.person, query: sensitive.query },
      HttpStatus.INTERNAL_SERVER_ERROR,
    ),
    sensitive.token,
  ]) {
    const result = captureResponse(exception, null)
    assert.equal(JSON.parse(calls.at(-1)![0] as string).path, 'unknown')
    assert.equal(result.body.code, ERROR_CODES.INTERNAL_ERROR)
    assert.equal(result.body.message, '服务器内部错误')
    assertNoPrivateValues({ result, calls })
  }
})

test('recognized business errors retain their HTTP contract while 5xx logs omit free-form explanation', (t) => {
  const calls: unknown[][] = []
  t.mock.method(Logger.prototype, 'error', (...args: unknown[]) => calls.push(args))
  const body = {
    code: ERROR_CODES.SERVICE_UNAVAILABLE,
    message: '名单服务暂时不可用，请稍后重试',
    details: { retryable: true },
  }
  const exception = new ApiHttpException(HttpStatus.SERVICE_UNAVAILABLE, body)
  exception.stack = `${sensitive.query}\n${sensitive.token}`

  const result = captureResponse(exception)

  assert.equal(result.status, HttpStatus.SERVICE_UNAVAILABLE)
  assert.deepEqual(result.body, { ...body, requestId: 'fictional-error-request' })
  const entry = JSON.parse(calls[0]![0] as string)
  assert.equal(entry.code, ERROR_CODES.SERVICE_UNAVAILABLE)
  assert.equal(entry.requestId, 'fictional-error-request')
  assert.equal('message' in entry, false)
  assertNoPrivateValues({ result, calls })
})

test('recognized client errors remain unchanged and do not generate server error logs', (t) => {
  const calls: unknown[][] = []
  t.mock.method(Logger.prototype, 'error', (...args: unknown[]) => calls.push(args))
  const result = captureResponse(
    new ApiHttpException(HttpStatus.CONFLICT, {
      code: ERROR_CODES.CONFLICT,
      message: '名单已经更新，请重新读取',
      details: { expectedVersion: 1 },
    }),
  )
  assert.equal(result.status, HttpStatus.CONFLICT)
  assert.deepEqual(result.body, {
    code: ERROR_CODES.CONFLICT,
    message: '名单已经更新，请重新读取',
    details: { expectedVersion: 1 },
    requestId: 'fictional-error-request',
  })
  assert.deepEqual(calls, [])
  assertNoPrivateValues(result)
})

test('a malformed id reaching the database (Prisma P2023 / PostgreSQL 22P02) is a 400, not a 500', (t) => {
  const calls: unknown[][] = []
  t.mock.method(Logger.prototype, 'error', (...args: unknown[]) => calls.push(args))
  for (const exception of [
    Object.assign(new Error(sensitive.query), {
      code: 'P2023',
      meta: { message: sensitive.person },
    }),
    Object.assign(new Error(sensitive.query), { code: 'P2010', meta: { code: '22P02' } }),
  ]) {
    const result = captureResponse(exception)
    assert.equal(result.status, HttpStatus.BAD_REQUEST)
    assert.deepEqual(result.body, {
      code: ERROR_CODES.BAD_REQUEST,
      message: '请求中的编号无效',
      requestId: 'fictional-error-request',
    })
    assertNoPrivateValues(result)
  }
  assert.equal(calls.length, 0, 'client errors are not logged as server failures')
})
