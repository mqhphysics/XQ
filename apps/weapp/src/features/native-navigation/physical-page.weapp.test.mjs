import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, dependencies) {
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => dependencies[name],
  })
  return module.exports
}
function harness(physical = false, options = {}) {
  let pages = options.pages || [
    { route: 'pages/index/index' },
    ...(physical ? [{ route: 'recording/technical/index' }] : []),
  ]
  let allowed = true,
    layer = false,
    current = 'data'
  const calls = []
  const taro = {
    getCurrentPages: () => pages,
    eventCenter: { trigger() {} },
    async navigateBack({ delta = 1 } = {}) {
      calls.push(['back', delta])
      pages = pages.slice(0, -delta)
    },
    async navigateTo({ url }) {
      calls.push(['open', url])
    },
    async reLaunch({ url }) {
      calls.push(['root', url])
    },
    async showToast() {},
  }
  const api = load('./index.weapp.ts', {
    react: {},
    '@tarojs/taro': { default: taro },
    './history.logic.weapp': load('./history.logic.weapp.ts', {}),
    './detail-route.weapp': load('./detail-route.weapp.ts', {}),
    './technical-route.logic.weapp': load('./technical-route.logic.weapp.ts', {}),
    './social-route.logic.weapp': load('./social-route.logic.weapp.ts', {}),
    './viewport.weapp': {},
    './viewport.logic.weapp': {},
    './motion-frame.weapp': {},
    './detail-context.weapp': {},
    '../../components/native-navigation/panel-context.weapp': {},
    '../product/session': { readSession: () => null },
    './leave-guard.weapp': options.guard || {
      allowNativeLeave: async () => allowed,
      closeNativeBackLayer: async () => layer,
    },
  })
  if (options.controller !== false)
    api.registerNativeMainController({
      section: () => current,
      goTo(section) {
        current = section
        calls.push(['section', section])
      },
    })
  return {
    api,
    calls,
    setPages: (value) => {
      pages = value
    },
    deny: () => {
      allowed = false
    },
    overlay: () => {
      layer = true
    },
  }
}
test('physical recorder back returns to the match instead of changing the background tab', async () => {
  const h = harness(true)
  assert.equal(await h.api.nativeBack(), 'handled')
  assert.deepEqual(h.calls, [['back', 1]])
})
test('social destinations open physical pages while the main match/person history remains intact', async () => {
  const h = harness()
  await h.api.openNativeDetail('/pages/person-detail/index?userId=user')
  await h.api.openNativeDetail('/pages/messages/index?userId=user')
  assert.deepEqual(h.calls, [['open', '/social/messages/index?userId=user']])
  assert.equal(h.api.readNativeHistory().cursor, 0)
  h.setPages([{ route: 'pages/index/index' }, { route: 'social/messages/index' }])
  assert.equal(h.api.nativeForward(), false)
  await h.api.nativeBack()
  assert.deepEqual(h.calls.at(-1), ['back', 1])
  assert.equal(h.api.readNativeHistory().cursor, 0)
})
test('a direct social deep link without a background main pager returns to the home page', async () => {
  const h = harness(false, { controller: false, pages: [{ route: 'social/messages/index' }] })
  await h.api.nativeBack()
  assert.deepEqual(h.calls, [['root', '/pages/index/index?section=home']])
})
test('an unsaved physical post comment still confirms before returning to its message page', async () => {
  let confirm = false,
    prompts = 0,
    discarded = 0
  const guard = load('./leave-guard.weapp.ts', {
    react: {
      useRef: (current) => ({ current }),
      useEffect: (effect) => effect(),
      useContext: () => true,
    },
    '@tarojs/taro': {
      default: {
        showModal: async () => {
          prompts++
          return { confirm }
        },
        showToast() {},
      },
    },
    './detail-context.weapp': { NativeDetailActiveContext: {} },
  })
  guard.useNativeLeaveProtection(
    true,
    false,
    () => {
      discarded++
    },
    true,
  )
  const h = harness(false, {
    guard,
    pages: [
      { route: 'pages/index/index' },
      { route: 'social/messages/index' },
      { route: 'pages/post-detail/index' },
    ],
  })
  await h.api.nativeBack()
  assert.equal(prompts, 1)
  assert.equal(h.calls.length, 0)
  assert.equal(discarded, 0)
  confirm = true
  await h.api.nativeBack()
  assert.equal(discarded, 1)
  assert.deepEqual(h.calls, [['back', 1]])
})
test('unsaved and visible overlay guards retain precedence over a physical page return', async () => {
  const dirty = harness(true)
  dirty.deny()
  await dirty.api.nativeBack()
  assert.equal(dirty.calls.length, 0)
  const overlay = harness(true)
  overlay.overlay()
  await overlay.api.nativeBack()
  assert.equal(overlay.calls.length, 0)
})
test('root detail and main-section returns retain their previous ordering', async () => {
  const h = harness()
  await h.api.openNativeDetail('/pages/post-detail/index?postId=post')
  assert.equal(h.api.readNativeHistory().cursor, 0)
  await h.api.nativeBack()
  assert.equal(h.api.readNativeHistory().cursor, -1)
  assert.equal(h.calls.length, 0)
  await h.api.nativeBack()
  assert.deepEqual(h.calls, [['section', 'team']])
})
test('technical links bypass embedded history while switching sections exits a physical page first', async () => {
  const h = harness()
  await h.api.openNativeDetail('/pages/readonly-match-detail/index?matchId=m1&technical=1')
  assert.deepEqual(h.calls, [['open', '/recording/technical/index?matchId=m1']])
  assert.equal(h.api.readNativeHistory().cursor, -1)
  const physical = harness(true)
  await physical.api.switchNativeSection('me')
  assert.deepEqual(physical.calls, [
    ['back', 1],
    ['section', 'me'],
  ])
})
