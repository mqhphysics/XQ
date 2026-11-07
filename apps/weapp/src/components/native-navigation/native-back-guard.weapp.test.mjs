import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate } from 'node:timers/promises'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'

test('a hidden root guard does not consume the physical recorder page back event', async () => {
  const events = new Map(),
    shows = [],
    hides = []
  let calls = 0,
    page = 0
  const taro = {
    nextTick(callback) {
      callback()
    },
    eventCenter: {
      on(name, callback) {
        if (!events.has(name)) events.set(name, new Set())
        events.get(name).add(callback)
      },
      off(name, callback) {
        events.get(name)?.delete(callback)
      },
    },
  }
  const module = { exports: {} }
  const source = ts.transpileModule(
    readFileSync(new URL('./native-back-guard.weapp.tsx', import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    clearTimeout() {},
    setTimeout() {},
    Date,
    require(name) {
      if (name === 'react/jsx-runtime') return jsx
      if (name === '@tarojs/components') return { PageContainer: 'PageContainer', View: 'View' }
      if (name === 'react')
        return {
          useState: (initial) => [initial, () => {}],
          useRef: (current) => ({ current }),
          useEffect: (callback) => callback(),
        }
      if (name === '@tarojs/taro')
        return {
          default: taro,
          useDidShow: (callback) => {
            shows[page] = callback
          },
          useDidHide: (callback) => {
            hides[page] = callback
          },
        }
      return {
        nativeBack: async () => {
          calls++
          return 'handled'
        },
      }
    },
  })
  module.exports.NativeBackGuard()
  hides[0]()
  page = 1
  module.exports.NativeBackGuard()
  for (const callback of events.get('xiaoqiu:native-request-back')) callback()
  await setImmediate()
  assert.equal(calls, 1)
  hides[1]()
  shows[0]()
  for (const callback of events.get('xiaoqiu:native-request-back')) callback()
  await setImmediate()
  assert.equal(calls, 2)
})
