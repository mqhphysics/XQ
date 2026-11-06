import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { setImmediate } from 'node:timers'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'

const uid = '11111111-1111-4111-8111-111111111111'
const record = '77777777-7777-4777-8777-777777777777'
const team = '88888888-8888-4888-8888-888888888888'
const user = { id: uid, organizationId: team, displayName: 'TEST ONLY' }
function source(relative, deps) {
  const file = new URL(relative, import.meta.url)
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => {
      if (name === 'react/jsx-runtime') return jsx
      if (name === '@tarojs/components') return new Proxy({}, { get: (_, key) => String(key) })
      if (name.endsWith('.scss')) return {}
      if (name in deps) return deps[name]
      throw Error('Unexpected dependency ' + name)
    },
  })
  return module.exports
}
function hooks(presets = []) {
  const state = [...presets],
    refs = []
  let cursor = 0,
    refCursor = 0
  return {
    begin() {
      cursor = 0
      refCursor = 0
    },
    api: {
      useState(initial) {
        const slot = cursor++
        if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial
        return [
          state[slot],
          (next) => {
            state[slot] = typeof next === 'function' ? next(state[slot]) : next
          },
        ]
      },
      useRef(initial) {
        const slot = refCursor++
        return refs[slot] || (refs[slot] = { current: initial })
      },
      useEffect() {},
      useCallback: (fn) => fn,
    },
  }
}
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children), ...nodes(node.props?.footer)]
}
function label(node) {
  if (Array.isArray(node)) return node.map(label).join('')
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return label(node?.props?.children || '')
}
const flush = () => new Promise((resolve) => setImmediate(resolve))
function identityHarness() {
  const writes = [],
    events = []
  const snapshot = {
    verifiedCandidates: [
      {
        id: 'record:' + record,
        expectedVersion: 4,
        kind: 'PLAYER',
        displayName: 'TEST',
        teamId: team,
        teamName: 'A',
      },
    ],
    candidates: [
      { id: 'player:' + record, kind: 'PLAYER', displayName: 'TEST', teamId: team, teamName: 'A' },
      { id: 'player:' + uid, kind: 'PLAYER', displayName: 'TEST', teamId: uid, teamName: 'B' },
    ],
    teams: [{ id: team, name: 'A' }],
    applications: [],
    hasMoreCandidates: false,
  }
  const session = { accessToken: 'TEST ONLY', user }
  const product = {
    createClientActionId: () => 'identity-test-action',
    request: async (path, options) => {
      if (options?.method === 'POST') writes.push({ path, ...options })
      return path === '/me/identity' ? snapshot : {}
    },
    getMe: async () => user,
  }
  const identity = source('../../features/identity/identity.repository.h5.ts', {
    '../product/product.repository': product,
  })
  const h = hooks([snapshot]),
    page = source('./identity-dialog.weapp.tsx', {
      react: h.api,
      '@tarojs/taro': {
        __esModule: true,
        default: {
          showToast: async () => ({}),
          eventCenter: { trigger: (...args) => events.push(args) },
        },
      },
      '../../features/getting-started/repository.weapp': { gettingStartedEvent: 'self-match' },
      '../../components/native-ui/index.weapp': { NativeDialog: 'Dialog' },
      '../../features/identity/identity.repository.h5': identity,
      '../../features/product-config/product-config.repository': {
        productConfigRepository: {
          getCapabilities: async () => ({
            actions: { 'identityApplications.submit': { enabled: true } },
          }),
        },
      },
      '../../features/product/product.repository': product,
      '../../features/product/session': { readSession: () => session, saveSession() {} },
    })
  return {
    writes,
    events,
    render() {
      h.begin()
      return page.NativeIdentityDialog({ user, onClose() {}, onChanged() {} })
    },
  }
}
test('native verified identity confirmation sends the UUID and version, never the record: display prefix', async () => {
  const h = identityHarness(),
    tree = h.render()
  const button = nodes(tree).find((n) => n.type === 'Button' && label(n) === '启用此身份')
  await button.props.onClick()
  assert.equal(h.writes.length, 1)
  assert.equal(h.writes[0].path, '/me/identity/confirm')
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].data)), {
    recordId: record,
    expectedVersion: 4,
  })
  assert.ok(h.writes[0].headers['Idempotency-Key'])
})
test('player and captain matching use self service instead of a manual application form', async () => {
  const h = identityHarness()
  let tree = h.render()
  assert.equal(nodes(tree).find((n) => n.type === 'Picker').props.value, 0)
  assert.equal(
    nodes(tree).filter((n) => n.props?.className?.includes('native-identity-candidate')).length,
    0,
  )
  nodes(tree)
    .find((n) => n.type === 'Button' && n.props['aria-label'] === '自助关联球员身份')
    .props.onClick()
  await flush()
  assert.equal(h.writes.length, 0)
  assert.deepEqual(h.events, [['self-match', 'match']])
})
test('personal cover submits managed media for the current user and refreshes the saved background', async () => {
  const h = hooks(),
    writes = []
  let session = { accessToken: 'TEST ONLY', user },
    saved,
    closed = false
  const updated = { ...user, coverUrl: '/api/media/test-cover.webp' }
  const page = source('../../features/managed-media/personal-cover.weapp.tsx', {
    react: h.api,
    '@tarojs/taro': { __esModule: true, default: { showToast: async () => ({}) } },
    '../../components/avatar-cropper/image.weapp': { NativeImageCropper: 'Cropper' },
    '../product/session': {
      readSession: () => session,
      saveSession: (value) => {
        session = value
      },
    },
    '../product/product.repository': {
      createClientActionId: () => 'cover-test-action',
      productRepository: { getMe: async () => updated },
      request: async (path, options) => {
        if (options?.method === 'POST') {
          writes.push({ path, ...options })
          return { status: 'APPROVED' }
        }
        return { backgroundUrl: updated.coverUrl }
      },
    },
  })
  h.begin()
  const tree = page.NativePersonalCoverEditor({
    userId: uid,
    onClose() {
      closed = true
    },
    onSaved(value, url) {
      saved = { value, url }
    },
  })
  assert.equal(tree.props.ratio, 2.8)
  await tree.props.onConfirm('data:image/jpeg;base64,TESTONLY')
  assert.equal(writes[0].data.purpose, 'USER_BACKGROUND')
  assert.equal(writes[0].data.targetId, uid)
  assert.equal(saved.url, updated.coverUrl)
  assert.equal(session.user.coverUrl, updated.coverUrl)
  assert.equal(closed, true)
})
