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

function dialogViewport() {
  const h = hooks()
  let changed,
    resized,
    now = 0,
    hidden = 0
  const info = { windowWidth: 390, windowHeight: 844 }
  const jobs = new Set()
  const api = source(
    '../native-ui/dialog-viewport.weapp.ts',
    {
      react: h.api,
      '@tarojs/taro': {
        default: {
          getWindowInfo: () => info,
          onKeyboardHeightChange: (run) => {
            changed = run
          },
          offKeyboardHeightChange: () => {
            changed = null
          },
          onWindowResize: (run) => {
            resized = run
          },
          offWindowResize: () => {
            resized = null
          },
          hideKeyboard: async () => {
            hidden++
          },
        },
      },
    },
    {
      setTimeout: (run, delay) => {
        const job = { run, at: now + delay }
        jobs.add(job)
        return job
      },
      clearTimeout: (job) => jobs.delete(job),
    },
  )
  const render = () => {
    h.begin()
    return api.useDialogViewport(info)
  }
  render()
  return {
    height: render,
    keyboard: (height, duration) => changed({ height, duration }),
    resize: (windowHeight, windowWidth = 390, flat = false) =>
      resized(flat ? { windowWidth, windowHeight } : { size: { windowWidth, windowHeight } }),
    advance: (duration) => {
      now += duration
      for (const job of [...jobs])
        if (job.at <= now) {
          jobs.delete(job)
          job.run()
        }
    },
    close: () => h.effects[0](),
    state: () => ({ listeners: !!changed || !!resized, pending: jobs.size, hidden }),
  }
}

test('dialog restores its full viewport after keyboard hide even without a final window resize', () => {
  for (const resizeFirst of [true, false]) {
    const d = dialogViewport()
    if (resizeFirst) d.resize(524)
    d.keyboard(320)
    if (!resizeFirst) d.resize(524)
    assert.equal(d.height(), 524, 'Android resize and keyboard height must not subtract twice')
    d.keyboard(0)
    d.advance(120)
    assert.equal(d.height(), 844, 'A stale window snapshot must not retain the short viewport')
    d.resize(844)
    assert.equal(d.height(), 844)
    d.close()
  }
})

test('dialog input handoff keeps its position and final hide honors the keyboard animation duration', () => {
  const d = dialogViewport()
  d.keyboard(320)
  assert.equal(d.height(), 524, 'Overlay keyboards also leave a visible editing area')
  d.keyboard(0)
  d.advance(80)
  assert.equal(d.height(), 524)
  d.keyboard(320)
  d.advance(120)
  assert.equal(d.height(), 524, 'Switching inputs must not briefly recenter the dialog')
  d.keyboard(0, 250)
  d.advance(249)
  assert.equal(d.height(), 524)
  d.advance(1)
  assert.equal(d.height(), 844)
  d.close()
})

test('dialog follows real window dimensions and closes its keyboard subscriptions and pending work', () => {
  const d = dialogViewport()
  d.resize(620, 480, true)
  d.advance(120)
  assert.equal(
    d.height(),
    620,
    'Fold and split-window changes use event sizes over stale snapshots',
  )
  d.keyboard(240)
  assert.equal(d.height(), 380)
  d.keyboard(0)
  d.close()
  assert.deepEqual(d.state(), { listeners: false, pending: 0, hidden: 1 })
  d.advance(500)
  assert.equal(d.height(), 380)
})
