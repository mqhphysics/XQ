import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import ts from 'typescript'
function source(relative, deps, globals = {}) {
  const module = { exports: {} },
    code = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => deps[name],
    ...globals,
  })
  return module.exports
}
function hooks() {
  const state = [],
    refs = [],
    effects = []
  let s = 0,
    r = 0,
    e = 0
  return {
    begin() {
      s = 0
      r = 0
      e = 0
    },
    effects,
    api: {
      createContext: () => ({}),
      useState: (initial) => {
        const i = s++
        if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial
        return [
          state[i],
          (value) => {
            state[i] = typeof value === 'function' ? value(state[i]) : value
          },
        ]
      },
      useRef: (initial) => {
        const i = r++
        return refs[i] || (refs[i] = { current: initial })
      },
      useEffect: (run) => {
        const i = e++
        if (!(i in effects)) effects[i] = run()
      },
    },
  }
}
test('moving from identifier to secure password keeps the compact form and does not hide the keyboard', () => {
  const h = hooks()
  let changed,
    time = 0
  const jobs = [],
    timers = {
      setTimeout: (run, delay) => {
        const job = { run, at: time + delay, cancelled: false }
        jobs.push(job)
        return job
      },
      clearTimeout: (job) => {
        if (job) job.cancelled = true
      },
    }
  const advance = (delay) => {
    time += delay
    for (const job of jobs)
      if (!job.cancelled && job.at <= time) {
        job.cancelled = true
        job.run()
      }
  }
  const api = source(
    './auth-keyboard.weapp.ts',
    {
      react: h.api,
      '@tarojs/taro': {
        default: {
          nextTick: (run) => run(),
          onKeyboardHeightChange: (run) => {
            changed = run
          },
          offKeyboardHeightChange() {},
        },
        useDidShow() {},
      },
    },
    timers,
  )
  const render = () => {
    h.begin()
    return api.useAuthKeyboard()
  }
  let model = render()
  model.focus('identifier')
  changed({ height: 320 })
  model = render()
  assert.equal(model.compact, true)
  model.blur('identifier')
  model.focus('password')
  changed({ height: 0 })
  advance(120)
  model = render()
  assert.equal(model.compact, true)
  assert.equal(model.effectiveHeight, 320)
  assert.equal(model.focused, 'password')
  changed({ height: 300 })
  model = render()
  assert.equal(model.effectiveHeight, 300)
  model.blur('password')
  changed({ height: 0 })
  advance(200)
  model = render()
  assert.equal(model.compact, false)
})
test('fold resize trusts event dimensions even when getWindowInfo is temporarily stale; subscriptions share one listener', () => {
  const h = hooks()
  let handler,
    on = 0,
    off = 0,
    shown
  let info = {
    windowWidth: 390,
    windowHeight: 844,
    screenHeight: 844,
    statusBarHeight: 24,
    safeArea: { bottom: 824 },
  }
  const api = source('../../features/native-navigation/viewport.weapp.ts', {
    react: h.api,
    '@tarojs/taro': {
      default: {
        getWindowInfo: () => info,
        onWindowResize: (run) => {
          handler = run
          on++
        },
        offWindowResize: () => {
          off++
        },
        nextTick: (run) => run(),
      },
      useDidShow: (run) => {
        shown = run
      },
      useResize: () => {},
    },
  })
  h.begin()
  api.useNativeViewport()
  handler({ size: { windowWidth: 480, windowHeight: 620 } })
  assert.equal(api.readNativeViewport().windowWidth, 480)
  info = { ...info, windowWidth: 568, windowHeight: 526 }
  shown()
  assert.equal(api.readNativeViewport().windowWidth, 568)
  assert.equal(on, 1)
  h.effects[0]()
  assert.equal(off, 1)
})
