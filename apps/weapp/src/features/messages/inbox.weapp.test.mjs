import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate } from 'node:timers/promises'
import ts from 'typescript'

function harness() {
  let session = { accessToken: 'token-a', user: { id: 'a', organizationId: 'org' } }
  const cleanups = [],
    states = [],
    timers = new Set(),
    events = new Map(),
    requests = []
  let show, hide, sessionChanged
  const hooks = {
    useState(initial) {
      const state = { value: typeof initial === 'function' ? initial() : initial }
      states.push(state)
      return [
        state.value,
        (value) => {
          state.value = value
        },
      ]
    },
    useEffect(effect) {
      cleanups.push(effect())
    },
  }
  const taro = {
    onAppShow(callback) {
      show = callback
    },
    onAppHide(callback) {
      hide = callback
    },
    offAppShow() {
      show = undefined
    },
    offAppHide() {
      hide = undefined
    },
    eventCenter: {
      on(name, callback) {
        events.set(name, callback)
      },
      off(name) {
        events.delete(name)
      },
    },
  }
  const compiled = ts.transpileModule(
    readFileSync(new URL('./inbox.weapp.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    setInterval(callback) {
      timers.add(callback)
      return callback
    },
    clearInterval(callback) {
      timers.delete(callback)
    },
    require(name) {
      if (name === 'react') return hooks
      if (name === '@tarojs/taro') return { default: taro }
      if (name.includes('session'))
        return {
          readSession: () => session,
          subscribeToSessionWrites(callback) {
            sessionChanged = callback
            return () => {
              sessionChanged = undefined
            }
          },
        }
      if (name.includes('repository'))
        return {
          messageRepository: {
            summary() {
              return new Promise((resolve, reject) => requests.push({ resolve, reject }))
            },
          },
        }
      throw Error(name)
    },
  })
  return {
    api: module.exports,
    states,
    requests,
    timers,
    show: () => show?.(),
    hide: () => hide?.(),
    switchUser(id) {
      session = id ? { accessToken: `token-${id}`, user: { id, organizationId: 'org' } } : null
      sessionChanged?.()
    },
    tick() {
      for (const timer of timers) timer()
    },
    close() {
      for (const cleanup of cleanups.reverse()) cleanup?.()
    },
  }
}
const summary = (count) => ({
  directUnreadCount: count,
  badgeCount: count,
  hasNotificationDot: false,
})

test('multiple message badge consumers share one poll and in-flight fetch', async () => {
  const h = harness()
  h.api.useInbox()
  h.api.useInbox()
  assert.equal(h.requests.length, 1)
  assert.equal(h.timers.size, 1)
  h.requests[0].resolve(summary(3))
  await setImmediate()
  assert.equal(h.states[0].value.summary.badgeCount, 3)
  assert.equal(h.states[1].value.summary.badgeCount, 3)
  h.close()
  assert.equal(h.timers.size, 0)
})

test('switching account discards the previous unread result and clearing session clears badges', async () => {
  const h = harness()
  h.api.useInbox()
  h.switchUser('b')
  assert.equal(h.requests.length, 2)
  h.requests[0].resolve(summary(99))
  await setImmediate()
  assert.equal(h.states[0].value.summary, null)
  h.requests[1].resolve(summary(2))
  await setImmediate()
  assert.equal(h.states[0].value.summary.badgeCount, 2)
  h.switchUser(null)
  assert.equal(h.states[0].value.summary, null)
  h.close()
})

test('marking messages read cannot be overwritten by an older poll, and background polls stop', async () => {
  const h = harness()
  h.api.useInbox()
  h.api.acceptInboxSummary(summary(0), 'token-a')
  h.requests[0].resolve(summary(8))
  await setImmediate()
  assert.equal(h.states[0].value.summary.badgeCount, 0)
  h.hide()
  h.tick()
  assert.equal(h.requests.length, 1)
  h.show()
  assert.equal(h.requests.length, 2)
  h.requests[1].resolve(summary(1))
  await setImmediate()
  assert.equal(h.states[0].value.summary.badgeCount, 1)
  h.close()
})
