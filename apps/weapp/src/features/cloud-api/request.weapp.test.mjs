import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { setImmediate } from 'node:timers'
import { URL } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

function fixture(initialize, callbackOnly = false) {
  const calls = []
  const wx = {
    cloud: {
      init: initialize,
      callContainer: (options) => {
        calls.push(options)
        const response = { statusCode: 200, data: { ok: true }, header: {} }
        if (callbackOnly) {
          Promise.resolve().then(() => options.success(response))
          return undefined
        }
        return Promise.resolve(response)
      },
    },
  }
  const taro = {
    request: () => {
      throw new Error('Ordinary HTTP must not run')
    },
  }
  const cache = new Map()
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    const module = { exports: {} }
    const compiled = ts.transpileModule(readFileSync(new URL(name, import.meta.url), 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText
    const dependency = (id) => {
      if (id === '@tarojs/taro') return taro
      if (id === './proxy.logic') return load('./proxy.logic.ts')
      throw new Error('Unexpected dependency ' + id)
    }
    new Function('require', 'wx', 'process', 'module', 'exports', compiled)(
      dependency,
      wx,
      {
        env: {
          TARO_APP_API_PROXY_ENV: 'fixture-env',
          TARO_APP_API_PROXY_SERVICE: 'fixture-service',
          TARO_APP_API_BASE_URL: 'https://fictional.test/api',
        },
      },
      module,
      module.exports,
    )
    cache.set(name, module.exports)
    return module.exports
  }
  return { ...load('./request.weapp.ts'), calls }
}

test('native requests wait for one shared asynchronous cloud initialization before calling the container', async () => {
  let release,
    initializations = 0,
    initializationOptions
  const api = fixture((options) => {
    initializations++
    initializationOptions = options
    return new Promise((resolve) => {
      release = resolve
    })
  })
  const first = api.apiRequest({ url: 'https://fictional.test/api/public/home', method: 'GET' })
  const second = api.apiRequest({
    url: 'https://fictional.test/api/auth/login',
    method: 'POST',
    data: { username: 'fictional' },
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(initializations, 1)
  assert.equal(
    initializationOptions,
    undefined,
    'CloudRun environment belongs in callContainer.config, not cloud.init',
  )
  assert.equal(api.calls.length, 0, 'No request can leave before initialization resolves')
  release()
  const replies = await Promise.all([first, second])
  assert.deepEqual(
    replies.map((r) => r.statusCode),
    [200, 200],
  )
  assert.equal(api.calls.length, 2)
  assert.equal(api.calls[0].config.env, 'fixture-env')
  assert.equal(api.calls[1].header['X-WX-SERVICE'], 'fixture-service')
})

test('native callback completion is accepted without waiting for a separate Promise result', async () => {
  const api = fixture(() => Promise.resolve(), true)
  assert.equal(
    (await api.apiRequest({ url: 'https://fictional.test/api/public/home' })).statusCode,
    200,
  )
  assert.equal(api.calls.length, 1)
})

test('failed cloud initialization sends no request and a later explicit action can initialize again', async () => {
  let attempts = 0
  const api = fixture(() =>
    ++attempts === 1 ? Promise.reject(new Error('SDK initialization failed')) : Promise.resolve(),
  )
  await assert.rejects(
    api.apiRequest({ url: 'https://fictional.test/api/public/home' }),
    /SDK initialization failed/,
  )
  assert.equal(api.calls.length, 0)
  assert.equal(
    (await api.apiRequest({ url: 'https://fictional.test/api/public/home' })).statusCode,
    200,
  )
  assert.equal(attempts, 2)
  assert.equal(api.calls.length, 1)
})
