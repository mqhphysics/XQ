import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { URL } from 'node:url'
import { setImmediate } from 'node:timers'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
function harness() {
  let cursor = 0,
    controller,
    blocked = false
  const slots = [],
    effects = [],
    events = new Map(),
    ticks = [],
    calls = [],
    sections = ['home', 'schedule', 'team', 'data', 'me']
  const slot = (initial) => {
    const i = cursor++
    return slots[i] || (slots[i] = { value: typeof initial === 'function' ? initial() : initial })
  }
  const hooks = {
    Component: class {},
    memo: (x) => x,
    useMemo: (fn) => fn(),
    useRef: (value) => {
      const s = slot(() => ({ current: value }))
      return s.value
    },
    useState: (initial) => {
      const s = slot(initial)
      return [
        s.value,
        (v) => {
          s.value = typeof v === 'function' ? v(s.value) : v
        },
      ]
    },
    useEffect: (fn, deps) => {
      const s = slot(() => ({}))
      if (!s.value.deps || deps.some((d, i) => d !== s.value.deps[i])) {
        s.value.deps = deps
        effects.push(fn)
      }
    },
  }
  const taro = {
    nextTick: (fn) => ticks.push(fn),
    eventCenter: {
      on: (key, fn) => events.set(key, fn),
      off() {},
      trigger: (key, ...args) => events.get(key)?.(...args),
    },
    createSelectorQuery: () => ({
      select() {
        return this
      },
      boundingClientRect() {
        return this
      },
      exec(fn) {
        fn?.()
      },
    }),
  }
  const nav = {
    nativeSections: sections,
    useNativeTournamentId: () => '',
    useNativeMainBlocked: () => blocked,
    canDragNativeMain: () => !blocked,
    nativeTouchPoint: (e) => e.point,
    registerNativeMainController: (c) => {
      controller = c
      return () => {}
    },
    setNativePagerProgress() {},
    switchNativeSection: async (s, id, d, isCurrent) => {
      if (!isCurrent || isCurrent()) {
        calls.push(s)
        controller.goTo(s)
      }
    },
  }
  const module = { exports: {} },
    code = ts.transpileModule(
      readFileSync(new URL('./main-pager.weapp.tsx', import.meta.url), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    setTimeout: () => 1,
    clearTimeout() {},
    require: (name) =>
      name === 'react'
        ? hooks
        : name === 'react/jsx-runtime'
          ? jsx
          : name === '@tarojs/components'
            ? {
                Button: 'Button',
                Image: 'Image',
                PageMeta: 'PageMeta',
                Swiper: 'Swiper',
                SwiperItem: 'SwiperItem',
                Text: 'Text',
                View: 'View',
              }
            : name === '@tarojs/taro'
              ? { default: taro, getCurrentInstance: () => ({ router: { params: {} } }) }
              : name.includes('viewport.weapp')
                ? {
                    useNativeViewport: () => ({ windowWidth: 390, windowHeight: 844 }),
                    readNativeViewport: () => ({ windowHeight: 844 }),
                  }
                : name.includes('viewport.logic')
                  ? { nativeWideWindow: () => false }
                  : name.includes('native-header-metrics')
                    ? { nativeHeaderMetrics: () => ({ height: 88 }) }
                    : name.includes('panel-context')
                      ? { NativePanelContext: { Provider: 'Provider' } }
                      : name.includes('session')
                        ? { readSession: () => null }
                        : name.includes('history.logic') ||
                            (name.includes('index.weapp') &&
                              name.includes('features/native-navigation'))
                          ? nav
                          : name.endsWith('.png')
                            ? { default: '/art.png' }
                            : {
                                default: 'Screen',
                                PublicShell: 'PublicShell',
                                DataState: 'DataState',
                                NativeRefreshScope: 'Scope',
                                NativeRefreshScroll: 'Scroll',
                                NativeBackGuard: 'Guard',
                                NativeCampusWelcome: 'Welcome',
                              },
  })
  const nodes = (n) =>
    !n || typeof n !== 'object'
      ? []
      : Array.isArray(n)
        ? n.flatMap(nodes)
        : [n, ...nodes(n.props?.children)]
  const render = () => {
    cursor = 0
    const tree = module.exports.NativeMainPager()
    for (const fn of effects.splice(0)) fn()
    return nodes(tree).find((n) => n.type === 'Swiper').props
  }
  return {
    render,
    calls,
    nav,
    events,
    ticks,
    get controller() {
      return controller
    },
    block: () => {
      blocked = true
    },
  }
}
test('main paging uses one native swiper and commits native touch changes once', async () => {
  const h = harness()
  let p = h.render()
  assert.equal(p.easingFunction, 'easeInOutCubic')
  assert.equal(p.duration, 400)
  await p.onChange({ detail: { source: '', current: 1 } })
  assert.equal(h.calls.length, 0)
  p.onTouchStart({ point: { x: 300, y: 200 } })
  p.onChange({ detail: { source: 'touch', current: 1 } })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(h.calls, ['schedule'])
  assert.equal(h.render().current, 1)
})
test('nested swipes and cancel cannot later commit a stray parent change', async () => {
  const h = harness(),
    p = h.render()
  p.onTouchStart({ point: { x: 200, y: 200 } })
  h.events.get('xiaoqiu:native-nested-touch')()
  p.onChange({ detail: { source: 'touch', current: 1 } })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.calls.length, 0)
  p.onTouchStart({ point: { x: 200, y: 200 } })
  p.onTouchCancel()
  p.onChange({ detail: { source: 'touch', current: 1 } })
  assert.equal(h.calls.length, 0)
})
test('blocked motion stays disabled and an old rejected reset cannot pull back a new navigation', async () => {
  const h = harness()
  h.render()
  h.block()
  let p = h.render()
  assert.equal(p.disableTouch, true)
  p.onTouchStart({ point: { x: 200, y: 200 } })
  p.onChange({ detail: { source: 'touch', current: 1 } })
  h.controller.goTo('data')
  for (const fn of h.ticks.splice(0)) fn()
  p = h.render()
  assert.equal(p.current, 3)
})
