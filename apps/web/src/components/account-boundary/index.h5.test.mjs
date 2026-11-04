import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { URL } from 'node:url'

import { isAccountEntryRoute } from '../../features/product/account-access.ts'
import { guestPageAllowed } from '../../features/product-config/access-boundary.logic.ts'
import { parseProductConfiguration } from '../../features/product-config/product-config.logic.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const ts = require('typescript')
let storedSession = null
let configuration = null
let failedAccount = false

// Render the actual H5 component before effects run. Taro must be able to find
// the initial page instance even while account verification hides its UI.
const source = readFileSync(new URL('./index.h5.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText
const componentModule = { exports: {} }
const load = (name) => {
  if (name === '@tarojs/taro') return {}
  if (name === '../auth-cursor/index.h5') return { mountCursorSkin: () => () => {} }
  if (name === '../identity-center/index.h5') return { IdentityCenterHost: () => null }
  if (name.endsWith('/account-access')) return { isAccountEntryRoute }
  if (name.endsWith('/access-boundary.logic')) return { guestPageAllowed }
  if (name.endsWith('/use-product-config.h5'))
    return {
      useProductConfiguration: () => ({
        configuration,
        phase: configuration ? 'ready' : 'unknown',
        error: null,
      }),
    }
  if (name.endsWith('/policy-state.h5'))
    return {
      readAccountPresence: () => ({
        session: storedSession,
        hasSession: Boolean(storedSession),
        needsAccount: failedAccount || Boolean(storedSession),
      }),
    }
  if (name.endsWith('/product.repository'))
    return {
      productRepository: {
        getMe() {
          throw new Error('Render must not authenticate before effects')
        },
      },
    }
  if (name.endsWith('/session.h5')) return { readSession: () => storedSession }
  if (name.endsWith('.scss')) return {}
  return require(name)
}
new Function('require', 'exports', 'module', compiled)(
  load,
  componentModule.exports,
  componentModule,
)
const { AccountBoundary } = componentModule.exports

function renderAt(route, session = null, config = null, failure = false) {
  const previousWindow = globalThis.window
  globalThis.window = { location: { hash: route, pathname: '/' } }
  storedSession = session
  configuration = config
  failedAccount = failure
  try {
    return renderToStaticMarkup(
      React.createElement(
        AccountBoundary,
        {
          overlays: React.createElement('aside', { 'data-overlay-test': true }, 'private overlay'),
          publicOverlays: React.createElement('aside', { 'data-public-overlay-test': true }, 'public detail overlay'),
        },
        React.createElement('div', { 'data-router-test': true }, 'Taro page instance'),
      ),
    )
  } finally {
    storedSession = null
    configuration = null
    failedAccount = false
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
}

test('unverified deep links retain the Taro route child while hiding it and excluding portal hosts', () => {
  for (const session of [null, { accessToken: 'fictional-unverified-token' }]) {
    const html = renderAt('#/pages/readonly-match-detail/index', session)
    assert.match(html, /data-router-test="true"/)
    assert.match(html, /style="display:none" aria-hidden="true"/)
    assert.ok(!html.includes('data-overlay-test'))
    assert.ok(!html.includes('data-public-overlay-test'))
  }
})

test('actual boundary opens only configured future public read pages and keeps private overlays closed', () => {
  const config = parseProductConfiguration({
    schemaVersion: 1,
    revision: 'future',
    accountRequired: false,
    serverGuestAccess: true,
    guest: { enabled: true },
    sport: { format: 'EIGHT_A_SIDE', playersPerSide: 8 },
    modules: {
      home: { enabled: true },
      schedule: { enabled: true },
      data: { enabled: true },
      teams: { enabled: true },
    },
  })
  for (const route of [
    '#/pages/index/index',
    '#/pages/readonly-match-detail/index?id=test',
    '#/pages/readonly-teams/index?tournamentId=test',
  ]) {
    const html = renderAt(route, null, config)
    assert.match(html, /style="display:contents" aria-hidden="false"/)
    assert.ok(!html.includes('data-overlay-test'))
    assert.ok(html.includes('data-public-overlay-test'))
  }
  for (const route of [
    '#/pages/me/index',
    '#/pages/my-team/index?review=roster',
    '#/pages/quick-report/index',
    '#/pages/unknown/index',
  ])
    assert.match(renderAt(route, null, config), /style="display:none" aria-hidden="true"/)
})

test('actual boundary never downgrades an existing or expired account into future guest access', () => {
  const config = parseProductConfiguration({
    schemaVersion: 1,
    revision: 'future',
    accountRequired: false,
    serverGuestAccess: true,
    guest: { enabled: true },
    sport: { format: 'EIGHT_A_SIDE', playersPerSide: 8 },
    modules: { home: { enabled: true } },
  })
  assert.match(
    renderAt('#/pages/index/index', { accessToken: 'fictional-invalid-session' }, config),
    /style="display:none" aria-hidden="true"/,
  )
  const html = renderAt('#/pages/index/index', null, config, true)
  assert.match(html, /style="display:none" aria-hidden="true"/)
  assert.match(html, /登录状态已失效/)
})

test('the login route remains mounted and visible while private portal hosts stay closed', () => {
  const html = renderAt('#/pages/login/index')
  assert.match(html, /data-router-test="true"/)
  assert.match(html, /style="display:contents" aria-hidden="false"/)
  assert.ok(!html.includes('data-overlay-test'))
})
