import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { URL } from 'node:url'

import * as entryLogic from '../../features/product-config/navigation-entry.logic.ts'
import { parseProductConfiguration } from '../../features/product-config/product-config.logic.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const ts = require('typescript')
const compiled = ts.transpileModule(
  readFileSync(new URL('./public-shell.shared.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  },
).outputText

// Invoke the actual component and its real click handlers without a browser or network.
function fixture(account = false) {
  const config = parseProductConfiguration({
    schemaVersion: 1,
    revision: 'future',
    accountRequired: false,
    serverGuestAccess: true,
    guest: { enabled: true },
    sport: { format: 'EIGHT_A_SIDE', playersPerSide: 8 },
    modules: { home: { enabled: true }, schedule: { enabled: true }, teams: { enabled: true } },
  })
  const state = {
    config,
    session: account
      ? {
          accessToken: 'fictional-token',
          expiresAt: '2099-01-01',
          user: { id: 'fictional-user', organizationId: 'test-org' },
        }
      : null,
    notices: [],
    routes: [],
    capabilityCalls: 0,
    capabilityEnabled: true,
  }
  const taro = {
    ENV_TYPE: { WEB: 'WEB' },
    getEnv: () => 'WEB',
    redirectTo: async ({ url }) => {
      state.routes.push(url)
    },
    showToast: async ({ title }) => {
      state.notices.push(title)
    },
  }
  const noop = () => undefined
  const load = (name) => {
    if (name === 'react')
      return {
        ...React,
        useCallback: (callback) => callback,
        useContext: () => null,
        useEffect: noop,
        useLayoutEffect: noop,
        useRef: (current) => ({ current }),
        useState: (initial) => [typeof initial === 'function' ? initial() : initial, noop],
      }
    if (name === '@tarojs/components') return { Button: 'button', Text: 'span', View: 'div' }
    if (name === '@tarojs/taro')
      return {
        ...taro,
        useDidShow: noop,
        getCurrentInstance: () => ({ router: { path: '/pages/index/index' } }),
      }
    if (name.endsWith('/navigation-entry.logic')) return entryLogic
    if (name.endsWith('/session')) return { readSession: () => state.session }
    if (name.endsWith('/policy-state'))
      return {
        getConfiguration: async () => {
          if (!state.config) throw new Error('offline')
          return state.config
        },
        readAccountPresence: () => ({
          session: state.session,
          hasSession: Boolean(state.session),
          needsAccount: Boolean(state.session),
        }),
      }
    if (name.endsWith('/product-config.repository'))
      return {
        productConfigRepository: {
          getCapabilities: async () => {
            state.capabilityCalls++
            return {
              schemaVersion: 1,
              organizationId: 'test-org',
              modules: config.modules,
              actions: {
                'schedule.read': {
                  enabled: state.capabilityEnabled,
                  scopes: [{ type: 'ORGANIZATION', id: 'test-org' }],
                },
              },
            }
          },
        },
      }
    // The instant entry answers wrap these same two reads (cached in the browser build).
    if (name.endsWith('/instant-entry')) {
      const policy = load('../../features/product-config/policy-state')
      const repository = load('../../features/product-config/product-config.repository')
      return {
        instantConfiguration: () => policy.getConfiguration(),
        instantCapabilities: () => repository.productConfigRepository.getCapabilities(),
        warmEntryAnswers: noop,
      }
    }
    if (name.endsWith('/use-product-config'))
      return { useProductConfiguration: () => ({ configuration: state.config }) }
    if (name.endsWith('/native-tabbar-track')) return { NativeTabbarTrack: () => null }
    if (name.endsWith('/product.repository')) return { productRepository: {} }
    if (name.endsWith('/native-navigation'))
      return { useNativeShell: () => ({ index: 0, duration: 0, touchHandlers: {} }) }
    if (name.endsWith('.scss')) return {}
    if (name.startsWith('.')) return new Proxy({}, { get: () => noop })
    return require(name)
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', 'window', compiled)(load, module.exports, module, {
    matchMedia: (query) => ({ matches: query.includes('reduced-motion') }),
  })
  const tree = module.exports.PublicShell({
    active: 'home',
    tournamentId: 'test-tournament',
    children: 'page',
  })
  const elements = []
  const visit = (element) => {
    if (Array.isArray(element)) {
      element.forEach(visit)
      return
    }
    if (!React.isValidElement(element)) return
    elements.push(element)
    visit(element.props.children)
  }
  visit(tree)
  return {
    state,
    buttons: (key) =>
      elements.filter((element) => element.type === 'button' && element.key === key),
  }
}

test('actual desktop and mobile nav buttons keep their labels and dispatch the enabled route after a closed click', async () => {
  for (const index of [0, 1]) {
    const { state, buttons } = fixture()
    const button = buttons('schedule')[index]
    assert.ok(button)
    assert.equal(button.props.disabled, undefined)
    assert.ok(JSON.stringify(button.props.children).includes('赛程'))
    state.config = {
      ...state.config,
      modules: { ...state.config.modules, schedule: { enabled: false, reason: null } },
    }
    button.props.onClick()
    await setImmediate()
    assert.deepEqual(state.notices, ['功能暂未开放'])
    assert.deepEqual(state.routes, [])
    state.config = {
      ...state.config,
      modules: { ...state.config.modules, schedule: { enabled: true, reason: null } },
    }
    button.props.onClick()
    await setImmediate()
    assert.deepEqual(state.routes, ['/pages/readonly-schedule/index?tournamentId=test-tournament'])
  }
})

test('actual guest team button enters a public directory and never the private team workspace', async () => {
  const { state, buttons } = fixture()
  buttons('team')[0].props.onClick()
  await setImmediate()
  assert.deepEqual(state.routes, ['/pages/readonly-teams/index?tournamentId=test-tournament'])
})

test('actual account navigation refreshes capability for each click and closes revoked or unreadable entry', async () => {
  const { state, buttons } = fixture(true)
  const button = buttons('schedule')[0]
  button.props.onClick()
  await setImmediate()
  state.capabilityEnabled = false
  button.props.onClick()
  await setImmediate()
  assert.equal(state.capabilityCalls, 2)
  assert.equal(state.routes.length, 1)
  state.config = null
  button.props.onClick()
  await setImmediate()
  assert.equal(state.routes.length, 1)
  assert.deepEqual(state.notices, ['功能暂未开放', '功能暂未开放'])
})
