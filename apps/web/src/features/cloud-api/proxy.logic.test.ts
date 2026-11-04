import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cloudApiMediaUrl,
  createCloudApiInterceptor,
  createCloudApiRequester,
  cloudApiFailureMessage,
  isTransientCloudFailure,
} from './proxy.logic.ts'

const configuration = {
  env: 'fictional-env',
  serviceName: 'fixture-proxy',
  apiBaseUrl: 'https://old.trycloudflare.com/api',
}
const reply = (statusCode: number) => ({
  statusCode,
  data: { message: 'fixture' },
  header: { ETag: 'fixture-etag', 'X-Xiaoqiu-Media-Origin': 'https://new.trycloudflare.com' },
})

test('one interceptor forwards API requests with session and version headers, preserving HTTP failures', async () => {
  const calls: unknown[] = []
  const interceptor = createCloudApiInterceptor(async (options) => {
    calls.push(options)
    return reply(401)
  }, configuration)
  const r = (await interceptor({
    requestParams: {
      url: `${configuration.apiBaseUrl}/me`,
      method: 'PUT',
      data: { version: 2 },
      header: { Authorization: 'Bearer fictional-session', 'idempotency-key': 'fixture-key' },
    },
    proceed: async () => {
      throw new Error('No direct upstream request is permitted')
    },
  })) as { statusCode: number; data: unknown }
  assert.equal(r.statusCode, 401)
  assert.deepEqual(r.data, { message: 'fixture' })
  assert.deepEqual(calls, [
    {
      config: { env: 'fictional-env' },
      path: '/api/me',
      method: 'PUT',
      data: { version: 2 },
      header: {
        Authorization: 'Bearer fictional-session',
        'idempotency-key': 'fixture-key',
        'X-WX-SERVICE': 'fixture-proxy',
      },
      timeout: 8000,
    },
  ])
})

test('non-API requests proceed normally; malformed and failed cloud replies never fall back to direct HTTP', async () => {
  let direct = 0
  const chain = {
    requestParams: { url: 'https://unrelated.test/file' },
    proceed: async () => {
      direct++
      return 'direct'
    },
  }
  const interceptor = createCloudApiInterceptor(async () => {
    throw new Error('cloud unavailable')
  }, configuration)
  assert.equal(await interceptor(chain), 'direct')
  await assert.rejects(
    interceptor({ ...chain, requestParams: { url: `${configuration.apiBaseUrl}/public/home` } }),
    /cloud unavailable/,
  )
  assert.equal(direct, 1)
  for (const result of [
    null,
    { proxyVersion: 1, data: {} },
    { proxyVersion: 1, transportError: { message: 'upstream timeout' } },
  ]) {
    const invalid = createCloudApiInterceptor(async () => result, configuration)
    await assert.rejects(
      invalid({ ...chain, requestParams: { url: `${configuration.apiBaseUrl}/me` } }),
    )
  }
})

test('cloud upstream rotation updates media URLs without rewriting unrelated external images', () => {
  assert.equal(
    cloudApiMediaUrl('/api/media/avatars/a.webp'),
    'https://new.trycloudflare.com/api/media/avatars/a.webp',
  )
  assert.equal(
    cloudApiMediaUrl('https://old.trycloudflare.com/api/media/avatars/a.webp'),
    'https://new.trycloudflare.com/api/media/avatars/a.webp',
  )
  assert.equal(cloudApiMediaUrl('https://external.test/a.webp'), undefined)
  assert.equal(cloudApiMediaUrl('data:image/png;base64,x'), undefined)
})

test('explicit cloud requests work without global interceptors or Object.fromEntries and never fall back to an HTTP domain', async () => {
  const original = Object.fromEntries
  Object.fromEntries = undefined as unknown as typeof Object.fromEntries
  try {
    const calls: Array<{ path: string; header: Record<string, unknown> }> = []
    const request = createCloudApiRequester(async (options) => {
      calls.push(options)
      return reply(200)
    }, configuration)
    const result = (await request({
      url: `${configuration.apiBaseUrl}/public/home`,
      header: { Authorization: 'Bearer fictional-session', 'x-wx-service': 'wrong-service' },
    })) as { statusCode: number }
    assert.equal(result.statusCode, 200)
    assert.equal(calls[0]!.path, '/api/public/home')
    assert.equal(calls[0]!.header['X-WX-SERVICE'], 'fixture-proxy')
    assert.equal(calls[0]!.header['x-wx-service'], undefined)
    await assert.rejects(
      request({ url: 'https://unregistered.test/api/public/home' }),
      /请求不属于已配置/,
    )
    assert.equal(calls.length, 1)
  } finally {
    Object.fromEntries = original
  }
})

test('cloud transport failures retain a useful sanitized cause instead of becoming an unexplained API failure', async () => {
  const request = createCloudApiRequester(async () => {
    throw {
      errMsg: 'callContainer:fail forbidden domain https://secret.test/?token=fictional-secret',
    }
  }, configuration)
  await assert.rejects(request({ url: `${configuration.apiBaseUrl}/public/home` }), (error) => {
    assert.match(cloudApiFailureMessage(error) || '', /callContainer:fail forbidden domain/)
    assert.doesNotMatch(String(error), /fictional-secret/)
    return true
  })
})

test('cloud read timeouts retry with growing pauses before reporting the failure', async () => {
  const waits: number[] = []
  let calls = 0
  const request = createCloudApiRequester(
    async () => {
      if (++calls < 3) throw { errMsg: 'cloud.callContainer:fail timeout' }
      return reply(200)
    },
    configuration,
    { wait: async (ms) => void waits.push(ms) },
  )
  const result = (await request({ url: `${configuration.apiBaseUrl}/public/home` })) as {
    statusCode: number
  }
  assert.equal(result.statusCode, 200)
  assert.equal(calls, 3)
  assert.deepEqual(waits, [800, 1600])

  let failures = 0
  const exhausted = createCloudApiRequester(
    async () => {
      failures++
      throw new Error('晓球云托管请求超时，请重试')
    },
    configuration,
    { wait: async () => {} },
  )
  await assert.rejects(exhausted({ url: `${configuration.apiBaseUrl}/public/home` }), (error) => {
    assert.match(cloudApiFailureMessage(error) || '', /云托管请求超时/)
    return true
  })
  assert.equal(failures, 4, 'one request plus three retries')
})

test('writes and permanent cloud failures are never replayed', async () => {
  let calls = 0
  const request = createCloudApiRequester(
    async () => {
      calls++
      throw { errMsg: 'cloud.callContainer:fail timeout' }
    },
    configuration,
    { wait: async () => {} },
  )
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    calls = 0
    await assert.rejects(request({ url: `${configuration.apiBaseUrl}/me`, method }))
    assert.equal(calls, 1, `${method} must not be retried`)
  }
  assert.equal(isTransientCloudFailure({ errMsg: 'callContainer:fail forbidden domain' }), false)
  assert.equal(isTransientCloudFailure(new Error('晓球云托管响应格式无效，请联系管理员')), false)
  assert.equal(isTransientCloudFailure(new Error('晓球云托管请求超时，请重试')), true)
  assert.equal(isTransientCloudFailure({ errMsg: 'request:fail network interrupted' }), true)
})
