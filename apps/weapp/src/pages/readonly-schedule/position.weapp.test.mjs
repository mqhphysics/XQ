import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'

test('schedule positions once without animation and preserves chosen date on panel return/refresh', () => {
  const slots = [],
    effects = [],
    ticks = []
  let cursor = 0,
    visible = true,
    queries = 0
  const state = (initial) => {
    const index = cursor++
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
    return [
      slots[index],
      (value) => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value
      },
    ]
  }
  const react = {
    useState: state,
    useRef: (current) => state(() => ({ current }))[0],
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useEffect(fn, deps) {
      const index = cursor++,
        old = slots[index]
      if (!old || deps.some((value, i) => value !== old.deps[i])) {
        old?.cleanup?.()
        slots[index] = { deps }
        effects.push(() => {
          slots[index].cleanup = fn()
        })
      }
    },
  }
  const dependencies = {
    react,
    'react/jsx-runtime': jsx,
    '@tarojs/components': {
      Button: 'Button',
      View: 'View',
      Text: 'Text',
      ScrollView: 'ScrollView',
    },
    '@tarojs/taro': {
      useDidShow() {},
      default: {
        nextTick: (fn) => ticks.push(fn),
        createSelectorQuery() {
          queries++
          const query = {
            select: () => query,
            boundingClientRect: (fn) => {
              fn({ height: 500 })
              return query
            },
            scrollOffset: (fn) => {
              fn({ scrollTop: 800 })
              return query
            },
            exec: (fn) => {
              fn?.()
              return query
            },
          }
          return query
        },
      },
    },
    '../../components/native-navigation/panel-context.weapp': {
      useNativePanelVisible: () => visible,
    },
    '../../features/product/native-refresh.weapp': { NativeRefreshScroll: 'NativeRefreshScroll' },
    '../../components/public-ui': { DataState: 'DataState' },
    '../../features/product/session': { readSession: () => null },
    '../../features/native-navigation/viewport.weapp': {
      useNativeViewport: () => ({ windowWidth: 375 }),
    },
    '../../features/native-navigation/viewport.logic.weapp': { nativeWideWindow: () => false },
    '../../features/product/product.format': { formatDate: (v) => v },
    './native-schedule.logic.weapp': {
      emptyScheduleFilter: {
        date: '',
        team: '',
        stage: '',
        status: 'all',
        primaryOnly: false,
        descending: false,
      },
      nativeMatchDate: (value) => (value.startsWith('2026-11-10') ? '2026-11-10' : '2026-11-08'),
      filterNativeSchedule: (matches) => matches,
      nativeScheduleDayGroups: () => [],
      nativeMatchStage: () => '',
      nativeRelativeDay: () => '',
    },
  }
  const module = { exports: {} }
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL('./desktop-schedule.weapp.tsx', import.meta.url), 'utf8').replace(
        'function ScheduleContent(',
        'export function ScheduleContent(',
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    {
      module,
      exports: module.exports,
      Date,
      Math,
      Set,
      Map,
      require: (name) => dependencies[name] || {},
    },
  )
  const nodes = (node) =>
    !node || typeof node !== 'object'
      ? []
      : Array.isArray(node)
        ? node.flatMap(nodes)
        : [node, ...nodes(node.props?.children)]
  let data = {
    tournament: { id: 'one' },
    schedule: [{ id: 'm', scheduledStartAt: '2026-11-10T12:00:00Z' }],
    labels: {},
  }
  const render = () => {
    cursor = 0
    return nodes(
      module.exports.ScheduleContent({ data, scope: 'all', options: [], onTournament() {} }),
    )
  }
  const flush = () => {
    while (effects.length || ticks.length) {
      ;(effects.shift() || ticks.shift())()
      render()
    }
  }
  const list = () => render().find((n) => n.type === 'NativeRefreshScroll').props
  assert.equal(list().style, 'visibility:hidden;')
  assert.equal(list().scrollWithAnimation, false)
  flush()
  assert.equal(list().style, '')
  assert.equal(list().scrollIntoView, '')
  render()
    .find((n) => n.props?.id === 'native-date-2026-11-10')
    .props.onClick()
  flush()
  list().onScroll()
  assert.equal(list().scrollIntoView, '')
  const initializedQueries = queries
  visible = false
  render()
  flush()
  visible = true
  render()
  flush()
  data = { ...data }
  render()
  flush()
  assert.equal(queries, initializedQueries)
  assert.equal(list().scrollIntoView, '')
  assert.match(
    render().find((n) => n.props?.id === 'native-date-2026-11-10').props.className,
    /is-active/,
  )
})
