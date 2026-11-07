import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate } from 'node:timers/promises'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'

function moduleAt(file, dependencies) {
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Date,
    Math,
    require: (name) => dependencies[name],
  })
  return module.exports
}
function harness(onChanged) {
  const states = [],
    requests = []
  let cursor = 0
  const slot = (initial) => {
    const index = cursor++
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
    return [
      states[index],
      (value) => {
        states[index] = typeof value === 'function' ? value(states[index]) : value
      },
    ]
  }
  const initial = {
    serverNow: '2026-11-07T04:20:00Z',
    scheduledStartAt: '2026-11-07T04:20:00Z',
    autoStartsAt: '2026-11-07T04:30:00Z',
    startedAt: null,
    startSource: 'PENDING',
    phase: 'PENDING',
    periodMinutes: 20,
    intervalMinutes: 10,
    periods: 2,
    elapsedSeconds: 0,
    phaseElapsedSeconds: 0,
    expectedEndAt: '2026-11-07T05:10:00Z',
    halfTimeStartsAt: '2026-11-07T04:40:00Z',
    secondHalfStartsAt: '2026-11-07T04:50:00Z',
    endedAt: null,
    canStart: true,
  }
  const { NativeMatchClock } = moduleAt('./clock.weapp.tsx', {
    'react/jsx-runtime': jsx,
    react: {
      useState: slot,
      useRef: (current) => slot(() => ({ current }))[0],
      useEffect() {},
      useCallback: (callback) => callback,
      useContext: () => true,
    },
    '@tarojs/components': { Button: 'Button', Text: 'Text', View: 'View' },
    '@tarojs/taro': {
      default: { eventCenter: { trigger() {} } },
      useDidHide() {},
      useDidShow() {},
    },
    '../native-navigation/detail-context.weapp': { NativeDetailActiveContext: {} },
    '../../components/native-navigation/panel-context.weapp': { useNativePanelVisible: () => true },
    '../product/session': { readSession: () => ({ accessToken: 'token' }) },
    '../product/league-time': { leagueTime: () => '12:20', leagueDate: (value) => new Date(value) },
    './clock.logic.weapp': moduleAt('./clock.logic.weapp.ts', {}),
    './clock.repository.weapp': {
      matchClockRepository: {
        start(matchId, id) {
          return new Promise((resolve, reject) => requests.push({ matchId, id, resolve, reject }))
        },
      },
    },
  })
  const nodes = (node) =>
    !node || typeof node !== 'object'
      ? []
      : Array.isArray(node)
        ? node.flatMap(nodes)
        : [node, ...nodes(node.props?.children)]
  const render = (allowStart = true) => {
    cursor = 0
    return nodes(NativeMatchClock({ matchId: 'match', initial, allowStart, onChanged }))
  }
  const button = () =>
    render().find((node) => node.props?.className === 'native-match-clock__start')
  return { initial, render, button, requests }
}
test('start double taps are locked and an uncertain retry retains the same UUID', async () => {
  const h = harness(),
    click = h.button().props.onClick
  click()
  click()
  assert.equal(h.requests.length, 1)
  assert.match(h.requests[0].id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
  h.requests[0].reject(Error('timeout'))
  await setImmediate()
  h.button().props.onClick()
  assert.equal(h.requests.length, 2)
  assert.equal(h.requests[1].id, h.requests[0].id)
  h.requests[1].resolve({
    ...h.initial,
    startedAt: '2026-11-07T04:20:00Z',
    startSource: 'MANUAL',
    phase: 'FIRST_HALF',
    canStart: false,
  })
  await setImmediate()
  assert.equal(h.button(), undefined)
})
test('the public display never renders an administrative start button by default', () => {
  const h = harness()
  assert.equal(
    h.render(false).some((node) => node.props?.className === 'native-match-clock__start'),
    false,
  )
})
test('the parent receives acknowledged snapshots, not an extra callback on each render', async () => {
  const changes = [],
    h = harness((clock) => changes.push(clock))
  h.render()
  h.render()
  assert.equal(changes.length, 0)
  h.button().props.onClick()
  h.requests[0].resolve({
    ...h.initial,
    startedAt: '2026-11-07T04:20:00Z',
    startSource: 'MANUAL',
    phase: 'FIRST_HALF',
    canStart: false,
  })
  await setImmediate()
  assert.equal(changes.length, 1)
  assert.equal(changes[0].phase, 'FIRST_HALF')
  h.render()
  h.render()
  assert.equal(changes.length, 1)
})
