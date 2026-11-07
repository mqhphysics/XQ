import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate } from 'node:timers/promises'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'

test('older notification pages survive silent refresh and returning; only explicit refresh resets them', async () => {
  const slots = [],
    effects = [],
    timers = new Set(),
    requests = []
  let cursor = 0,
    show,
    hide,
    summaryRefreshes = 0
  const take = (initial) => {
    const index = cursor++
    if (!(index in slots)) slots[index] = initial()
    return slots[index]
  }
  const hooks = {
    useState(initial) {
      const slot = take(() => ({ value: typeof initial === 'function' ? initial() : initial }))
      return [
        slot.value,
        (value) => {
          slot.value = typeof value === 'function' ? value(slot.value) : value
        },
      ]
    },
    useRef(current) {
      return take(() => ({ current }))
    },
    useContext() {
      return true
    },
    useCallback(fn, deps) {
      const slot = take(() => ({ fn, deps }))
      if (deps.some((value, index) => value !== slot.deps[index])) {
        slot.fn = fn
        slot.deps = deps
      }
      return slot.fn
    },
    useEffect(fn, deps) {
      const slot = take(() => ({ deps: null, cleanup: null }))
      if (!slot.deps || deps.some((value, index) => value !== slot.deps[index])) {
        slot.cleanup?.()
        slot.deps = deps
        effects.push(() => {
          slot.cleanup = fn()
        })
      }
    },
  }
  const module = { exports: {} }
  const source = ts.transpileModule(
    readFileSync(new URL('./notifications.weapp.tsx', import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    Date,
    setInterval(fn) {
      timers.add(fn)
      return fn
    },
    clearInterval(fn) {
      timers.delete(fn)
    },
    require(name) {
      if (name === 'react/jsx-runtime') return jsx
      if (name === 'react') return hooks
      if (name === '@tarojs/components')
        return {
          Button: 'Button',
          Image: 'Image',
          ScrollView: 'ScrollView',
          Text: 'Text',
          View: 'View',
        }
      if (name === '@tarojs/taro')
        return {
          getCurrentInstance: () => ({ router: { params: {} } }),
          useDidShow: (fn) => {
            show = fn
          },
          useDidHide: (fn) => {
            hide = fn
          },
        }
      if (name.includes('messages/repository'))
        return {
          messageRepository: {
            notifications(category, before) {
              return new Promise((resolve) => requests.push({ category, before, resolve }))
            },
          },
        }
      if (name.includes('messages/inbox'))
        return {
          useInbox: () => ({ summary: { preferences: { badges: true } } }),
          refreshInbox: async () => {
            summaryRefreshes++
          },
        }
      if (name.endsWith('/session')) return { readSession: () => ({ accessToken: 'token' }) }
      if (name.endsWith('/product.format')) return { formatRelativeTime: () => '刚刚' }
      if (name.endsWith('/badge.logic')) return { messageActorLabel: () => '用户' }
      return {
        NativeSocialPage: 'Page',
        UserAvatar: 'Avatar',
        DataState: 'DataState',
        MessageBadge: 'Badge',
        MessageIcon: 'Icon',
        NativeDetailActiveContext: {},
      }
    },
  })
  const Category = module.exports.default({ category: 'likes' }).type
  const nodes = (node) =>
    !node || typeof node !== 'object'
      ? []
      : Array.isArray(node)
        ? node.flatMap(nodes)
        : [node, ...nodes(node.props?.children)]
  const render = () => {
    cursor = 0
    const tree = Category({ category: 'likes' })
    for (const effect of effects.splice(0)) effect()
    return nodes(tree)
  }
  const notice = (id) => ({
    id,
    category: 'likes',
    title: '点赞',
    body: null,
    linkPath: null,
    readAt: null,
    createdAt: '2026-11-07T00:00:00Z',
    actors: [{ id: 'actor', displayName: '用户', avatarUrl: null }],
    actorCount: 1,
    unreadCount: 1,
    target: null,
  })
  render()
  requests[0].resolve({ items: [notice('first')], nextCursor: 'next' })
  await setImmediate()
  let tree = render()
  tree.find((node) => node.props?.className === 'native-message-load-more').props.onClick()
  requests[1].resolve({ items: [notice('older')], nextCursor: null })
  await setImmediate()
  tree = render()
  assert.equal(tree.filter((node) => node.props?.className === 'native-message-notice').length, 2)
  for (const timer of timers) timer()
  await setImmediate()
  render()
  assert.equal(requests.length, 2)
  hide()
  render()
  show()
  tree = render()
  await setImmediate()
  assert.equal(requests.length, 2)
  assert.equal(tree.filter((node) => node.props?.className === 'native-message-notice').length, 2)
  assert.ok(summaryRefreshes >= 2)
  tree.find((node) => node.type === 'ScrollView').props.onRefresherRefresh()
  requests[2].resolve({ items: [notice('fresh')], nextCursor: 'fresh-cursor' })
  await setImmediate()
  tree = render()
  assert.equal(tree.filter((node) => node.props?.className === 'native-message-notice').length, 1)
  assert.equal(tree.find((node) => node.props?.className === 'native-message-notice').key, 'fresh')
})
