import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { URL } from 'node:url'

import * as accessBoundary from './access-boundary.logic.ts'
import * as nativeReadPolicy from '../product/native-read-policy.ts'
import { parseProductConfiguration } from './product-config.logic.ts'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const configuration = (enabled) =>
  parseProductConfiguration({
    schemaVersion: 1,
    revision: 'test',
    accountRequired: !enabled,
    serverGuestAccess: enabled,
    guest: { enabled },
    sport: { format: 'EIGHT_A_SIDE', playersPerSide: 8 },
    modules: { home: { enabled: true }, schedule: { enabled: true }, teams: { enabled: true } },
  })
const fictionalSession = (token = 'fictional-test-session', organizationId = 'test-org') => ({
  accessToken: token,
  user: { id: 'test-user', organizationId },
})

function loadGetCache() {
  const compiled = ts.transpileModule(
    readFileSync(new URL('../product/get-cache.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('require', 'exports', 'module', compiled)(
    () => {
      throw new Error('get-cache has no dependencies')
    },
    module.exports,
    module,
  )
  return module.exports
}

// Execute the real request implementations. Only the network/platform and account storage are fake.
function fixture({ web = true, enabled = true, session = null, needsAccount = false } = {}) {
  const state = {
    session,
    needsAccount,
    config: configuration(enabled),
    configFailure: false,
    configurationReads: 0,
    requests: [],
    invalidations: 0,
    respond: () => ({ statusCode: 200, data: { items: [] } }),
  }
  const sessionApi = {
    readSession: () => state.session,
    clearSession: () => {
      state.session = null
    },
    saveSession: (value) => {
      state.session = value
      state.needsAccount = true
    },
    leaveGuestMode: () => undefined,
  }
  const policy = {
    readAccountPresence: () => ({
      session: state.session,
      hasSession: Boolean(state.session),
      needsAccount: state.needsAccount || Boolean(state.session),
    }),
    getConfiguration: async () => {
      state.configurationReads++
      if (state.configFailure) throw new Error('offline')
      return state.config
    },
    markAccountInvalid: () => {
      state.invalidations++
      state.needsAccount = true
      state.session = null
    },
    clearAccountByUser: () => {
      state.session = null
      state.needsAccount = false
    },
  }
  const taro = {
    ENV_TYPE: { WEB: 'WEB', WEAPP: 'WEAPP' },
    getEnv: () => (web ? 'WEB' : 'WEAPP'),
    request: async (request) => {
      state.requests.push(request)
      return state.respond(request)
    },
  }
  function loadRepository(relativePath) {
    const compiled = ts.transpileModule(
      readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true,
        },
      },
    ).outputText
    const module = { exports: {} }
    const load = (name) => {
      if (name === '@tarojs/taro') return taro
      if (name === '../cloud-api/request') return { apiRequest: taro.request }
      if (name.endsWith('/session')) return sessionApi
      if (name.endsWith('/policy-state') || name === './policy-state') return policy
      if (name.endsWith('/access-boundary.logic')) return accessBoundary
      if (name === './product-config.logic') return { parseProductConfiguration }
      if (name === './mock-fixture') return { readonlyScheduleMockFixture: { tournaments: [] } }
      if (name === './readonly-schedule.logic')
        return { sortMatchesByStartAt: (matches) => matches }
      if (name === './get-cache') return loadGetCache()
      if (name === './native-read-policy') return nativeReadPolicy
      if (name === './get-cache-store') return { bindGetCacheStore: () => undefined }
      if (name === '../cloud-api/proxy.logic') return loadRepository('../cloud-api/proxy.logic.ts')
      if (name.endsWith('/tournament-scope'))
        return loadRepository('../product/tournament-scope.ts')
      if (name.endsWith('/league-time.ts')) return loadRepository('../product/league-time.ts')
      throw new Error(`Unexpected repository dependency: ${name}`)
    }
    new Function('require', 'exports', 'module', 'process', compiled)(
      load,
      module.exports,
      module,
      { env: { TARO_APP_API_BASE_URL: 'https://fictional-api.test/api' } },
    )
    return module.exports
  }
  const productModule = loadRepository('../product/product.repository.ts')
  return {
    state,
    product: productModule.productRepository,
    request: productModule.request,
    invalidateNativeReads: productModule.invalidateNativeProductReads,
    readonly: loadRepository('../readonly-schedule/readonly-schedule.repository.ts')
      .readonlyScheduleRepository,
    capabilities: loadRepository('./product-config.repository.ts').productConfigRepository,
  }
}

test('WeChat coalesces concurrent reads, reuses fresh data and bypasses it on pull refresh', async () => {
  const { state, product, invalidateNativeReads } = fixture({
    web: false,
    session: fictionalSession(),
  })
  let release
  state.respond = () =>
    new Promise((resolve) => {
      release = resolve
    })
  const first = product.getHome(),
    second = product.getHome()
  assert.equal(state.requests.length, 1)
  release({ statusCode: 200, data: { revision: 'first' } })
  assert.deepEqual(await Promise.all([first, second]), [
    { revision: 'first' },
    { revision: 'first' },
  ])
  assert.deepEqual(await product.getHome(), { revision: 'first' })
  assert.equal(state.requests.length, 1)
  invalidateNativeReads()
  state.respond = () => ({ statusCode: 200, data: { revision: 'latest' } })
  assert.deepEqual(await product.getHome(), { revision: 'latest' })
  assert.equal(state.requests.length, 2)
})

test('WeChat mutation prevents an older response from overwriting or satisfying the next read', async () => {
  const { state, product } = fixture({ web: false, session: fictionalSession() })
  let releaseOld,
    reads = 0
  state.respond = (request) =>
    request.method === 'GET'
      ? ++reads === 1
        ? new Promise((resolve) => {
            releaseOld = resolve
          })
        : { statusCode: 200, data: { revision: 'after-write' } }
      : { statusCode: 200, data: { favorited: true } }
  const older = product.getHome()
  await product.setPostFavorite('post', true)
  const latest = await product.getHome()
  releaseOld({ statusCode: 200, data: { revision: 'before-write' } })
  assert.deepEqual(latest, { revision: 'after-write' })
  assert.deepEqual(await older, latest)
  assert.deepEqual(await product.getHome(), latest)
  assert.equal(reads, 2)
})

test('WeChat cached catalog reads do not cross an organization or account boundary', async () => {
  const { state, product } = fixture({
    web: false,
    session: fictionalSession('session-one', 'org-one'),
  })
  state.respond = () => ({
    statusCode: 200,
    data: { items: [{ id: state.session.user.organizationId }] },
  })
  assert.deepEqual(await product.getPublishedTournaments(), { items: [{ id: 'org-one' }] })
  state.session = fictionalSession('session-two', 'org-two')
  assert.deepEqual(await product.getPublishedTournaments(), { items: [{ id: 'org-two' }] })
  assert.equal(state.requests.length, 2)
  state.respond = () => {
    state.session = fictionalSession('session-two', 'org-three')
    return { statusCode: 200, data: { items: [{ id: 'old-org' }] } }
  }
  await assert.rejects(product.getHome(), /账号已切换/)
})

test('both actual H5 repositories allow only future-configured public GET without a bearer token', async () => {
  const { state, product, readonly } = fixture()
  assert.deepEqual(await product.getPublishedTournaments(), { items: [] })
  assert.deepEqual(await readonly.listTournaments(), { data: [], source: 'api' })
  assert.equal(state.requests.length, 2)
  assert.ok(
    state.requests.every(
      (request) => request.method === 'GET' && !('Authorization' in request.header),
    ),
  )
  assert.ok(
    state.requests.every(
      (request) => request.url === 'https://fictional-api.test/api/public/tournaments',
    ),
  )
})

test('closed, missing, inconsistent, failed or expired-account configuration blocks both H5 requests', async () => {
  for (const mode of ['closed', 'missing', 'inconsistent', 'offline', 'expired']) {
    const { state, product, readonly } = fixture({
      enabled: mode !== 'closed',
      needsAccount: mode === 'expired',
    })
    if (mode === 'missing') state.config = null
    if (mode === 'inconsistent') state.config = { ...state.config, accountRequired: true }
    if (mode === 'offline') state.configFailure = true
    await assert.rejects(product.getHome(), (error) => error.statusCode === 401)
    await assert.rejects(readonly.listTournaments(), (error) => error.statusCode === 401)
    assert.equal(state.requests.length, 0, mode)
  }
})

test('future guest configuration grants no me, admin, captain, messaging, unknown read or write request', async () => {
  const { state, product } = fixture()
  const privateRequests = [
    () => product.getMe(),
    () => product.getAdminIdentities(),
    () => product.getCaptainWorkspace('team'),
    () => product.getConversations(),
    () => product.getTeamPreferences(),
    () => product.getPerson('user'),
    () => product.reviewMatch('match', 5),
    () => product.createPost('test', 'action'),
  ]
  for (const request of privateRequests)
    await assert.rejects(request(), (error) => error.statusCode === 401)
  assert.equal(state.requests.length, 0)
})

test('explicit login remains usable after account expiry without a bearer header', async () => {
  const { state, product } = fixture({ enabled: false, needsAccount: true })
  state.respond = () => ({ statusCode: 200, data: fictionalSession() })
  await product.login('test-account', 'fictional-password')
  assert.equal(state.requests[0].method, 'POST')
  assert.equal(state.requests[0].header.Authorization, undefined)
  assert.equal(state.configurationReads, 0)
  assert.equal(state.session.accessToken, 'fictional-test-session')
})

test('a real account sends its bearer token and an actual 401 latches login instead of downgrading to guest', async () => {
  for (const repository of ['product', 'readonly']) {
    const current = fixture({ session: fictionalSession() })
    current.state.respond = () => ({ statusCode: 401, data: { message: 'actual unauthorized' } })
    const read =
      repository === 'product'
        ? () => current.product.getHome()
        : () => current.readonly.listTournaments()
    await assert.rejects(
      read(),
      (error) => error.statusCode === 401 && error.message === 'actual unauthorized',
    )
    assert.equal(current.state.requests[0].header.Authorization, 'Bearer fictional-test-session')
    assert.equal(current.state.requests[0].header['x-organization-id'], 'test-org')
    assert.equal(current.state.invalidations, 1)
    current.state.respond = () => ({ statusCode: 200, data: { items: [] } })
    await assert.rejects(read(), (error) => error.statusCode === 401)
    assert.equal(current.state.requests.length, 1)
  }
})

test('both actual future guest requests propagate server 400/401 and never return a mock success', async () => {
  for (const statusCode of [400, 401]) {
    const { state, product, readonly } = fixture()
    state.respond = () => ({ statusCode, data: { message: `actual ${statusCode}` } })
    await assert.rejects(
      product.getPublishedTournaments(),
      (error) => error.statusCode === statusCode && error.message === `actual ${statusCode}`,
    )
    await assert.rejects(
      readonly.listTournaments(),
      (error) => error.statusCode === statusCode && error.message === `actual ${statusCode}`,
    )
    assert.equal(state.invalidations, 0)
  }
})

test('an old response cannot clear a replacement account or return capabilities for a switched organization', async () => {
  for (const repository of ['product', 'readonly', 'capabilities']) {
    const current = fixture({ session: fictionalSession('fictional-old') })
    current.state.respond = () => {
      current.state.session = fictionalSession('fictional-new')
      return { statusCode: 401, data: { message: 'old account response' } }
    }
    const request =
      repository === 'product'
        ? current.product.getHome
        : repository === 'readonly'
          ? current.readonly.listTournaments
          : current.capabilities.getCapabilities
    await assert.rejects(request())
    assert.equal(current.state.session.accessToken, 'fictional-new')
    assert.equal(current.state.invalidations, 0)
  }
  const current = fixture({ session: fictionalSession() })
  current.state.respond = () => {
    current.state.session = fictionalSession('fictional-test-session', 'other-org')
    return { statusCode: 200, data: { schemaVersion: 1, organizationId: 'test-org' } }
  }
  await assert.rejects(current.capabilities.getCapabilities(), /重新验证会话/)
})

test('concurrent capability consumers share one request and receive separate objects without caching roles', async () => {
  const { state, capabilities } = fixture({ web: false, session: fictionalSession() })
  const data = {
    schemaVersion: 1,
    organizationId: 'test-org',
    actions: { report: { enabled: true } },
  }
  let release
  state.respond = () =>
    new Promise((resolve) => {
      release = resolve
    })
  const first = capabilities.getCapabilities(),
    second = capabilities.getCapabilities()
  assert.equal(state.requests.length, 1)
  release({ statusCode: 200, data })
  const [a, b] = await Promise.all([first, second])
  a.actions.report.enabled = false
  assert.equal(b.actions.report.enabled, true)
  state.respond = () => ({ statusCode: 200, data })
  await capabilities.getCapabilities()
  assert.equal(state.requests.length, 2, 'A later role read still reaches the server')
})

test('capability request sharing separates replacement accounts and clears failures for retry', async () => {
  const { state, capabilities } = fixture({ web: false, session: fictionalSession('old') })
  const releases = []
  state.respond = () => new Promise((resolve) => releases.push(resolve))
  const old = assert.rejects(capabilities.getCapabilities(), /重新验证会话/)
  state.session = fictionalSession('new', 'new-org')
  const current = capabilities.getCapabilities()
  releases[0]({ statusCode: 200, data: { schemaVersion: 1, organizationId: 'test-org' } })
  await old
  const peer = capabilities.getCapabilities()
  assert.equal(state.requests.length, 2, 'Completing the old request must not release the new one')
  releases[1]({ statusCode: 200, data: { schemaVersion: 1, organizationId: 'new-org' } })
  await Promise.all([current, peer])
  state.respond = () => ({ statusCode: 500, data: {} })
  await assert.rejects(capabilities.getCapabilities())
  state.respond = () => ({ statusCode: 200, data: { schemaVersion: 1, organizationId: 'new-org' } })
  await capabilities.getCapabilities()
  assert.equal(state.requests.length, 4)
})

test('shared repository H5 guards leave the existing WeChat anonymous request branch unchanged', async () => {
  const { state, product, readonly } = fixture({ web: false, enabled: false, needsAccount: true })
  await product.getPublishedTournaments()
  assert.deepEqual(await readonly.listTournaments(), { data: [], source: 'api' })
  assert.equal(state.requests.length, 2)
  assert.equal(state.configurationReads, 0)
})

test('native read telemetry records events without invalidating freshly cached visible pages', async () => {
  const { state, product, request } = fixture({ web: false, session: fictionalSession() })
  state.respond = (options) => ({
    statusCode: 200,
    data: options.method === 'POST' ? { accepted: 1 } : { items: [] },
  })
  await product.getHome()
  await request('/me/feed-events', { method: 'POST', data: { events: [] } })
  await request('/matches/test-match/technical-statistics', {
    method: 'POST',
    data: { operations: [] },
  })
  await product.getHome()
  assert.equal(state.requests.filter((x) => x.method === 'GET' || !x.method).length, 1)
})
