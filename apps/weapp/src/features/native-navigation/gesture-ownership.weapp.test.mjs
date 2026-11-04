import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { URL } from 'node:url'
import { setTimeout, clearTimeout, setImmediate } from 'node:timers'
import ts from 'typescript'
function load(file, deps) {
  const module = { exports: {} },
    code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => deps[name],
    setTimeout,
    clearTimeout,
  })
  return module.exports
}
function harness() {
  let current = 'data',
    allowed = true
  const events = new Map(),
    calls = []
  const taro = {
    getCurrentPages: () => [{ route: 'pages/index/index' }],
    getWindowInfo: () => ({ windowWidth: 390 }),
    eventCenter: {
      on: (key, fn) => events.set(key, fn),
      off() {},
      trigger: (key, ...args) => events.get(key)?.(...args),
    },
    onKeyboardHeightChange() {},
    offKeyboardHeightChange() {},
  }
  const logic = load('./history.logic.weapp.ts', {})
  const api = load('./index.weapp.ts', {
    react: {
      useRef: (current) => ({ current }),
      useEffect: (fn) => fn(),
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
      useContext: () => null,
      useCallback: (fn) => fn,
    },
    '@tarojs/taro': {
      default: taro,
      getCurrentInstance: () => ({ router: { params: {} } }),
      useDidShow() {},
    },
    './history.logic.weapp': logic,
    './viewport.weapp': { useNativeViewport: () => ({ windowWidth: 390 }) },
    './viewport.logic.weapp': { nativeWideWindow: () => false },
    './detail-context.weapp': {},
    '../../components/native-navigation/panel-context.weapp': {},
    '../product/session': { readSession: () => null },
    './leave-guard.weapp': {
      allowNativeLeave: async () => allowed,
      closeNativeBackLayer: async () => false,
    },
    './motion-frame.weapp': {},
  })
  api.registerNativeMainController({
    section: () => current,
    goTo: (section) => {
      current = section
      calls.push(section)
    },
    start() {},
    move() {},
    end() {},
    cancel() {},
  })
  return {
    api,
    calls,
    setAllowed: (value) => {
      allowed = value
    },
  }
}
const touch = (x, y = 200) => ({
  timeStamp: 1,
  changedTouches: [{ clientX: x, clientY: y }],
  stopPropagation() {
    this.stopped = true
  },
})
test('inner native swipes have one owner, never choose the tab twice, and release ownership on cancel', () => {
  const { api, calls } = harness()
  let selected = 0
  const g = api.useNestedNativeSwipe(1, 3, () => selected++, false, true),
    start = touch(250)
  g.onTouchStart(start)
  assert.equal(start.stopped, true)
  const move = touch(130)
  g.onTouchMove(move)
  assert.equal(move.stopped, true)
  g.onTouchEnd(touch(100))
  assert.equal(selected, 0)
  assert.equal(calls.length, 0)
  g.onTouchStart(touch(220))
  g.onTouchCancel()
  const after = touch(100)
  g.onTouchMove(after)
  assert.equal(after.stopped, undefined)
})
test('an outward swipe at an inner boundary moves only one main page; vertical scrolling does not', async () => {
  const { api, calls } = harness()
  const g = api.useNestedNativeSwipe(
    0,
    3,
    () => assert.fail('native inner owns tab changes'),
    false,
    true,
  )
  g.onTouchStart(touch(100))
  g.onTouchEnd(touch(200, 205))
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(calls, ['team'])
  g.onTouchStart(touch(100))
  g.onTouchEnd(touch(150, 500))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.length, 1)
})
test('detail screen edge yields to back gesture while centre belongs to its content swiper', () => {
  const { api } = harness(),
    g = api.useNestedNativeSwipe(1, 3, () => {}, true, true),
    edge = touch(12)
  g.onTouchStart(edge)
  assert.equal(edge.stopped, undefined)
  const move = touch(150)
  g.onTouchMove(move)
  assert.equal(move.stopped, undefined)
  g.onTouchEnd(move)
  const centre = touch(130)
  g.onTouchStart(centre)
  assert.equal(centre.stopped, true)
})
test('an obsolete async navigation decision cannot overwrite a newer gesture', async () => {
  const { api, calls } = harness()
  let active = true
  const pending = api.switchNativeSection('schedule', undefined, 1, () => active)
  active = false
  await pending
  assert.equal(calls.length, 0)
})
