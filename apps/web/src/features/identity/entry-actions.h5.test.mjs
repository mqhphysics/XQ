import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { fileURLToPath, URL } from 'node:url'

const require = createRequire(import.meta.url)
const React = require('react')
const ts = require('typescript')
const clone = (value) => JSON.parse(JSON.stringify(value))
const organizationId = 'fictional-org'
const availability = (enabled = true, scopes = [{ type: 'ORGANIZATION', id: organizationId }]) => ({
  enabled,
  reason: enabled ? null : '功能暂未开放',
  scopes,
})
const role = (name, scopeType, scopeId) => ({ role: name, scopeType, scopeId })
const user = (roles = []) => ({
  id: 'fictional-user',
  organizationId,
  displayName: '虚构测试用户',
  linkedPlayer: null,
  roles,
})
const session = (token = 'fictional-old-token') => ({
  accessToken: token,
  expiresAt: '2099-01-01T00:00:00Z',
  user: user(),
})
const matchDto = (id, tournamentId) => ({
  id,
  tournamentId,
  matchCode: id,
  title: '测试小组赛',
  status: 'SCHEDULED',
  scheduledStartAt: '2099-01-02T12:00:00Z',
  homeTeam: { id: 'home', teamCode: 'HOME', name: '虚构主队' },
  awayTeam: { id: 'away', teamCode: 'AWAY', name: '虚构客队' },
})

// Load the actual H5 component, entry actions, capability repository and both data repositories.
// Only HTTP/Taro, account storage and unused React effects are replaced; no action is mocked.
function fixture() {
  const modules = Object.fromEntries(
    [
      'home',
      'schedule',
      'data',
      'teams',
      'community',
      'teamManagement',
      'matchReporting',
      'administration',
      'directMessages',
      'identityApplications',
      'goalMedia',
    ].map((id) => [id, { enabled: true, reason: null }]),
  )
  const state = {
    session: session(),
    needsAccount: true,
    requests: [],
    notices: [],
    routes: [],
    assignments: [],
    events: [],
    captainOpens: [],
    choices: [],
    actionSheets: [],
    fetchRequests: [],
    overrides: new Map(),
    environment: { TARO_APP_API_BASE_URL: 'https://fictional-api.test/api' },
    capabilities: {
      schemaVersion: 1,
      revision: 'first',
      organizationId,
      modules,
      actions: {
        'identityApplications.submit': availability(),
        'teams.manage': availability(true, [{ type: 'TEAM', id: 'team-a' }]),
        'matchReports.write': availability(true, [{ type: 'MATCH', id: 'match-a' }]),
        'administration.manage': availability(),
        'goalMedia.submit': availability(),
        'goalMedia.review': availability(false),
        'goalMedia.publish': availability(false),
      },
    },
  }
  state.fetchReply = () => ({
    ok: true,
    status: 200,
    json: async () => clone(state.capabilities),
    blob: async () => ({ fixtureBlob: true }),
  })
  const fetchHttp = async (url, options) => {
    state.fetchRequests.push({ url, options })
    return state.fetchReply(url, options)
  }
  const taro = {
    ENV_TYPE: { WEB: 'WEB' },
    getEnv: () => 'WEB',
    showToast: async ({ title }) => {
      state.notices.push(title)
    },
    navigateTo: async ({ url }) => {
      state.routes.push(url)
    },
    showActionSheet: async ({ itemList }) => {
      state.actionSheets.push(itemList)
      return { tapIndex: state.choices.shift() ?? 0 }
    },
    request: async (request) => {
      state.requests.push(request)
      const path = request.url.replace('https://fictional-api.test/api', '')
      if (state.overrides.has(path)) return state.overrides.get(path)(request)
      if (path === '/me/capabilities') return { statusCode: 200, data: clone(state.capabilities) }
      if (path.startsWith('/captain/teams/')) {
        const id = path.split('/').at(-1)
        return { statusCode: 200, data: { team: { id, name: `虚构${id}` } } }
      }
      if (path === '/public/tournaments')
        return {
          statusCode: 200,
          data: { items: [{ id: 'tournament-a' }, { id: 'tournament-b' }] },
        }
      const tournament = /^\/public\/tournaments\/(tournament-[ab])(?:\/(schedule|teams))?$/.exec(
        path,
      )
      if (tournament) {
        const id = tournament[1]
        const dto = {
          id,
          name: `虚构${id}`,
          status: 'PUBLISHED',
          tournamentCode: id,
          season: { id: 'season', seasonCode: 'TEST', name: '虚构赛季' },
          ruleVersions: [],
        }
        if (tournament[2] === 'teams') return { statusCode: 200, data: { items: [] } }
        if (tournament[2] === 'schedule')
          return {
            statusCode: 200,
            data: {
              tournament: dto,
              revision: { version: 1, publishedAt: '2099-01-01T00:00:00Z' },
              matches:
                id === 'tournament-a'
                  ? [matchDto('match-a', id), matchDto('match-denied', id)]
                  : [matchDto('match-other-tournament', id)],
            },
          }
        return { statusCode: 200, data: dto }
      }
      throw new Error(`Unexpected test HTTP path: ${path}`)
    },
  }
  const storage = {
    readSession: () => state.session,
    clearSession: () => {
      state.session = null
    },
    saveSession: (next) => {
      state.session = next
    },
    leaveGuestMode: () => undefined,
  }
  const policy = {
    readAccountPresence: () => ({
      session: state.session,
      hasSession: Boolean(state.session),
      needsAccount: state.needsAccount,
    }),
    markAccountInvalid: () => {
      state.needsAccount = true
      state.session = null
    },
    getConfiguration: async () => {
      throw new Error('Anonymous configuration must not authorize this private handler')
    },
    clearAccountByUser: () => {
      state.session = null
      state.needsAccount = false
    },
  }
  const windowStub = {
    matchMedia: () => ({
      matches: true,
      media: '',
      addEventListener() {},
      removeEventListener() {},
    }),
    dispatchEvent: (event) => {
      state.events.push(event.type)
      if (event.type === 'xiaoqiu:open-captain-manage') state.captainOpens.push(event.detail)
    },
    location: {
      assign: (url) => {
        state.assignments.push(url)
      },
    },
  }
  const cache = new Map()
  const loadFile = (url) => {
    const key = url.href
    if (cache.has(key)) return cache.get(key).exports
    const module = { exports: {} }
    cache.set(key, module)
    const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText
    const load = (name) => {
      if (name === '@tarojs/taro') return taro
      if (name === 'react') return { ...React, useEffect: () => undefined }
      if (name.endsWith('.scss')) return {}
      if (/\/session(?:\.h5)?$/.test(name)) return storage
      if (name.endsWith('/policy-state')) return policy
      if (name.endsWith('/use-product-config.h5'))
        return { useProductConfiguration: () => ({ configuration: null }) }
      if (name.endsWith('/overlay-focus')) return { useOverlayFocus: () => undefined }
      if (!name.startsWith('.')) return require(name)
      const relative = new URL(name, url)
      const candidates = /\.(?:ts|tsx)$/.test(name)
        ? [relative]
        : ['.h5.ts', '.h5.tsx', '.ts', '.tsx'].map((suffix) => new URL(`${relative.href}${suffix}`))
      const target = candidates.find((candidate) => existsSync(fileURLToPath(candidate)))
      if (!target) throw new Error(`Unresolved actual test dependency: ${name}`)
      return loadFile(target)
    }
    new Function('require', 'exports', 'module', 'process', 'window', 'Event', 'fetch', compiled)(
      load,
      module.exports,
      module,
      { env: state.environment },
      windowStub,
      class {
        constructor(type) {
          this.type = type
        }
      },
      fetchHttp,
    )
    return module.exports
  }
  const actions = loadFile(new URL('./entry-actions.h5.ts', import.meta.url)).identityEntryActions
  const media = loadFile(new URL('../managed-media/repository.h5.ts', import.meta.url))
  const IdentityEntry = loadFile(
    new URL('../../components/identity-center/index.h5.tsx', import.meta.url),
  ).IdentityEntry
  const renderButtons = (roles) => {
    const tree = IdentityEntry({ user: user(roles) })
    const found = []
    const text = (element) =>
      Array.isArray(element)
        ? element.map(text).join('')
        : React.isValidElement(element)
          ? text(element.props.children)
          : (element ?? '')
    const visit = (element) => {
      if (Array.isArray(element)) {
        element.forEach(visit)
        return
      }
      if (!React.isValidElement(element)) return
      if (element.type === 'button')
        found.push({
          label: text(element.props.children).replace(/\s*→$/, '').trim(),
          props: element.props,
        })
      visit(element.props.children)
    }
    visit(tree)
    return found
  }
  return {
    state,
    actions,
    media,
    renderButtons,
    paths: () =>
      state.requests.map((request) => request.url.replace('https://fictional-api.test/api', '')),
  }
}

test('actual IdentityEntry keeps identity button clickable and the same callback observes fresh feature changes', async () => {
  const { state, renderButtons, paths } = fixture()
  const button = renderButtons([]).find((item) => item.label === '我的身份')
  assert.ok(button)
  assert.equal(button.props.disabled, undefined)
  state.capabilities.modules.identityApplications.enabled = false
  state.capabilities.actions['identityApplications.submit'] = availability(false)
  button.props.onClick()
  await setImmediate()
  assert.deepEqual(state.notices, ['功能暂未开放'])
  assert.deepEqual(state.events, [])
  state.capabilities.modules.identityApplications.enabled = true
  state.capabilities.actions['identityApplications.submit'] = availability()
  state.capabilities.revision = 'second'
  button.props.onClick()
  await setImmediate()
  assert.deepEqual(state.events, ['xiaoqiu:identity:open'])
  assert.deepEqual(paths(), ['/me/capabilities', '/me/capabilities'])
})

test('actual team button reads only explicit TEAM workspace grants, deduplicates them and uses the chosen team', async () => {
  const { state, renderButtons, paths } = fixture()
  const button = renderButtons([role('TEAM_COACH', 'TEAM', 'team-a')]).find(
    (item) => item.label === '球队管理',
  )
  assert.ok(button)
  state.capabilities.actions['teams.manage'].scopes = [
    { type: 'ORGANIZATION', id: organizationId },
    { type: 'TEAM', id: 'team-a' },
    { type: 'TEAM', id: 'team-a' },
    { type: 'TEAM', id: 'team-b' },
  ]
  state.choices.push(1)
  button.props.onClick()
  await setImmediate()
  assert.deepEqual(paths(), [
    '/me/capabilities',
    '/captain/teams/team-a',
    '/captain/teams/team-b',
    '/me/capabilities',
  ])
  assert.deepEqual(state.actionSheets, [['虚构team-a', '虚构team-b']])
  assert.deepEqual(state.captainOpens, [{ teamId: 'team-b', teamName: '虚构team-b' }])
})

test('organization grant alone enters its admin portal without becoming a team workspace; invalid coach scope shows no team button', async () => {
  const { state, actions, renderButtons, paths } = fixture()
  state.capabilities.actions['teams.manage'].scopes = [{ type: 'ORGANIZATION', id: organizationId }]
  await actions.teamManagement()
  assert.deepEqual(paths(), ['/me/capabilities', '/me/capabilities'])
  assert.deepEqual(state.routes, [])
  assert.deepEqual(state.assignments, ['/admin/'])
  assert.deepEqual(state.notices, [])
  assert.ok(
    !renderButtons([role('TEAM_COACH', 'ORGANIZATION', organizationId)]).some(
      (button) => button.label === '球队管理',
    ),
  )
})

test('actual information button maps HTTP tournament/schedule DTOs and routes only to its permitted match', async () => {
  const { state, renderButtons, paths } = fixture()
  const button = renderButtons([role('MATCH_REPORTER', 'MATCH', 'match-a')]).find(
    (item) => item.label === '信息录入',
  )
  assert.ok(button)
  button.props.onClick()
  await setImmediate()
  assert.deepEqual(state.routes, ['/pages/quick-report/index?matchId=match-a'])
  assert.equal(state.actionSheets.length, 0)
  assert.ok(paths().includes('/public/tournaments'))
  assert.ok(paths().includes('/public/tournaments/tournament-a'))
  assert.ok(paths().includes('/public/tournaments/tournament-a/teams'))
  assert.equal(
    paths().filter((path) => path === '/public/tournaments/tournament-a/schedule').length,
    2,
  )
  assert.ok(
    state.requests.every(
      (request) => request.header.Authorization === 'Bearer fictional-old-token',
    ),
  )
})

test('actual information handler has no eligible match for a foreign organization grant or revoked action', async () => {
  const { state, actions } = fixture()
  state.capabilities.actions['matchReports.write'].scopes = [
    { type: 'ORGANIZATION', id: 'foreign-org' },
  ]
  await actions.informationEntry()
  assert.deepEqual(state.routes, [])
  assert.match(state.notices[0], /没有可操作的对象/)
  const requests = state.requests.length
  state.capabilities.actions['matchReports.write'] = availability(false)
  await actions.informationEntry()
  assert.equal(state.requests.length, requests + 1)
  assert.equal(state.notices.at(-1), '功能暂未开放')
})

test('actual information handler propagates HTTP failure and missing H5 API without a mock success', async () => {
  const current = fixture()
  current.state.overrides.set('/public/tournaments', () => ({
    statusCode: 400,
    data: { message: 'actual invalid tournament request' },
  }))
  await current.actions.informationEntry()
  assert.deepEqual(current.state.routes, [])
  assert.deepEqual(current.state.notices, ['actual invalid tournament request'])
  const missing = fixture()
  delete missing.state.environment.TARO_APP_API_BASE_URL
  await missing.actions.informationEntry()
  assert.deepEqual(missing.state.routes, [])
  assert.deepEqual(missing.state.notices, ['尚未配置 API 地址'])
})

test('actual management-center button assigns the same-site /admin/ route and revoked capability prevents it', async () => {
  const { state, renderButtons, paths } = fixture()
  const button = renderButtons([role('ORGANIZATION_ADMIN', 'ORGANIZATION', organizationId)]).find(
    (item) => item.label === '管理中心',
  )
  assert.ok(button)
  button.props.onClick()
  await setImmediate()
  assert.deepEqual(state.assignments, ['/admin/'])
  state.capabilities.actions['administration.manage'] = availability(false)
  button.props.onClick()
  await setImmediate()
  assert.deepEqual(state.assignments, ['/admin/'])
  assert.deepEqual(state.notices, ['功能暂未开放'])
  assert.deepEqual(paths(), ['/me/capabilities', '/me/capabilities'])
})

test('expired/revoked account and in-flight capability account switch never execute an identity or admin action', async () => {
  for (const action of ['identity', 'administrationEntry']) {
    const expired = fixture()
    expired.state.session = null
    await expired.actions[action]()
    assert.deepEqual(expired.paths(), [])
    assert.deepEqual(expired.state.events, [])
    assert.deepEqual(expired.state.assignments, [])
    assert.deepEqual(expired.state.notices, ['请先登录账号'])
    const revoked = fixture()
    revoked.state.overrides.set('/me/capabilities', () => ({
      statusCode: 401,
      data: { message: 'actual expired session' },
    }))
    await revoked.actions[action]()
    assert.equal(revoked.state.session, null)
    assert.equal(revoked.state.needsAccount, true)
    assert.deepEqual(revoked.state.events, [])
    assert.deepEqual(revoked.state.assignments, [])
    const switched = fixture()
    switched.state.overrides.set('/me/capabilities', () => {
      switched.state.session = session('fictional-new-token')
      return { statusCode: 200, data: clone(switched.state.capabilities) }
    })
    await switched.actions[action]()
    assert.deepEqual(switched.state.events, [])
    assert.deepEqual(switched.state.assignments, [])
    assert.match(switched.state.notices[0], /重新验证会话/)
  }
})

test('actual handlers discard team and information navigation if the account switches after capabilities resolve', async () => {
  const team = fixture()
  team.state.overrides.set('/captain/teams/team-a', () => {
    team.state.session = session('fictional-new-token')
    return { statusCode: 200, data: { team: { id: 'team-a', name: '旧账号的虚构球队' } } }
  })
  await team.actions.teamManagement()
  assert.deepEqual(team.state.routes, [])
  const information = fixture()
  information.state.overrides.set('/public/tournaments', () => {
    information.state.session = session('fictional-new-token')
    return { statusCode: 200, data: { items: [{ id: 'tournament-a' }] } }
  })
  await information.actions.informationEntry()
  assert.deepEqual(information.state.routes, [])
})

test('selection pagination still chooses an explicitly granted TEAM and organization maintenance requires its own admin capability', async () => {
  const team = fixture()
  team.state.capabilities.actions['teams.manage'].scopes = Array.from(
    { length: 7 },
    (_, index) => ({ type: 'TEAM', id: `team-${index + 1}` }),
  )
  team.state.choices.push(5, 1)
  await team.actions.teamManagement()
  assert.equal(team.state.actionSheets[0].at(-1), '下一页')
  assert.deepEqual(team.state.actionSheets[1], ['虚构team-6', '虚构team-7', '返回第一页'])
  assert.deepEqual(team.state.captainOpens, [{ teamId: 'team-7', teamName: '虚构team-7' }])
  const organization = fixture()
  organization.state.capabilities.actions['teams.manage'].scopes = [
    { type: 'ORGANIZATION', id: organizationId },
  ]
  organization.state.capabilities.actions['administration.manage'] = availability(false)
  await organization.actions.teamManagement()
  assert.deepEqual(organization.paths(), ['/me/capabilities', '/me/capabilities'])
  assert.deepEqual(organization.state.assignments, [])
  assert.deepEqual(organization.state.notices, ['功能暂未开放'])
})

test('latest team/match grant is fetched after data selection and revocation prevents actual navigation', async () => {
  for (const action of ['teamManagement', 'informationEntry']) {
    const current = fixture()
    let capabilityReads = 0
    current.state.overrides.set('/me/capabilities', () => {
      capabilityReads++
      const result = clone(current.state.capabilities)
      if (capabilityReads > 1)
        result.actions[action === 'teamManagement' ? 'teams.manage' : 'matchReports.write'].scopes =
          []
      return { statusCode: 200, data: result }
    })
    await current.actions[action]()
    assert.equal(capabilityReads, 2)
    assert.deepEqual(current.state.routes, [])
    assert.match(current.state.notices[0], /已失去/)
  }
})

test('same-token user or organization changes invalidate the handler before a private team navigation', async () => {
  for (const field of ['id', 'organizationId']) {
    const current = fixture()
    current.state.overrides.set('/captain/teams/team-a', () => {
      const replacement = clone(current.state.session)
      replacement.user[field] = 'fictional-replacement'
      current.state.session = replacement
      return { statusCode: 200, data: { team: { id: 'team-a', name: '旧账号虚构队伍' } } }
    })
    await current.actions.teamManagement()
    assert.deepEqual(current.state.routes, [])
    assert.deepEqual(current.state.notices, ['账号已变更，请重新打开此入口'])
  }
})

test('forced-rendered identity/admin buttons close when a malformed DTO grants the action but closes or omits its module', async () => {
  for (const missing of [false, true]) {
    for (const entry of [
      { module: 'identityApplications', label: '我的身份', roles: [] },
      {
        module: 'administration',
        label: '管理中心',
        roles: [role('ORGANIZATION_ADMIN', 'ORGANIZATION', organizationId)],
      },
    ]) {
      const current = fixture()
      if (missing) delete current.state.capabilities.modules[entry.module]
      else current.state.capabilities.modules[entry.module].enabled = false
      const button = current.renderButtons(entry.roles).find((item) => item.label === entry.label)
      assert.ok(button)
      assert.equal(button.props.disabled, undefined)
      button.props.onClick()
      await setImmediate()
      assert.deepEqual(current.state.notices, ['功能暂未开放'])
      assert.deepEqual(current.state.events, [])
      assert.deepEqual(current.state.assignments, [])
    }
  }
})

test('second fresh capability module closure overrides an otherwise still-enabled information action', async () => {
  const current = fixture()
  let reads = 0
  current.state.overrides.set('/me/capabilities', () => {
    const data = clone(current.state.capabilities)
    if (++reads > 1) data.modules.matchReporting.enabled = false
    return { statusCode: 200, data }
  })
  await current.actions.informationEntry()
  assert.equal(reads, 2)
  assert.deepEqual(current.state.routes, [])
  assert.deepEqual(current.state.notices, ['功能暂未开放'])
})

test('actual media capability reader sends the current session and keeps grants in its own organization', async () => {
  const current = fixture()
  const data = await current.media.readMediaCapabilities()
  assert.equal(data.enabled, true)
  assert.equal(data.canSubmit, true)
  assert.equal(data.canDirectPublish, false)
  assert.equal(
    current.state.fetchRequests[0].options.headers.Authorization,
    'Bearer fictional-old-token',
  )
  assert.equal(current.state.fetchRequests[0].options.headers['X-Organization-Id'], organizationId)
  current.state.capabilities.actions['goalMedia.submit'] = availability(true, [
    { type: 'ORGANIZATION', id: 'foreign-org' },
  ])
  assert.equal((await current.media.readMediaCapabilities()).canSubmit, false)
})

test('actual media JSON and blob readers reject token, user or organization changes during HTTP', async () => {
  for (const field of ['token', 'id', 'organizationId']) {
    for (const kind of ['json', 'blob']) {
      const current = fixture()
      current.state.fetchReply = () => {
        const replacement = clone(current.state.session)
        if (field === 'token') replacement.accessToken = 'fictional-new-token'
        else replacement.user[field] = 'fictional-replacement'
        current.state.session = replacement
        return {
          ok: true,
          status: 200,
          json: async () => clone(current.state.capabilities),
          blob: async () => ({ fixtureBlob: true }),
        }
      }
      await assert.rejects(
        kind === 'json'
          ? current.media.mediaRequest('me/capabilities')
          : current.media.privateMediaBlob('/api/media-assets/fictional/poster', {}),
        /账号已切换/,
      )
      assert.equal(current.state.fetchRequests.length, 1)
    }
  }
})

test('actual media reader rejects an absent account and preserves server error messages', async () => {
  const missing = fixture()
  missing.state.session = null
  await assert.rejects(missing.media.mediaRequest('media-assets/mine'), /请先登录账号/)
  assert.deepEqual(missing.state.fetchRequests, [])
  const failure = fixture()
  failure.state.fetchReply = () => ({
    ok: false,
    status: 403,
    json: async () => ({ message: 'actual media denied' }),
  })
  await assert.rejects(failure.media.mediaRequest('media-assets/mine'), /actual media denied/)
})
