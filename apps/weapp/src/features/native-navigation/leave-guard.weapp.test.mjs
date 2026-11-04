import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
function harness() {
  const cleanup = [],
    module = { exports: {} }
  const code = ts.transpileModule(
    readFileSync(new URL('./leave-guard.weapp.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) =>
      name === 'react'
        ? {
            useRef: (current) => ({ current }),
            useEffect: (effect) => cleanup.push(effect()),
            useContext: () => true,
          }
        : name === '@tarojs/taro'
          ? { default: {} }
          : { NativeDetailActiveContext: {} },
  })
  return { api: module.exports, cleanup }
}
test('an idle welcome coordinator must not swallow the match back button or system back', async () => {
  const { api } = harness()
  api.useNativeBackLayer(async () => false)
  assert.equal(await api.closeNativeBackLayer(), false)
})
test('a visible overlay consumes back; idle layers yield to the visible one below', async () => {
  const { api } = harness()
  let closed = 0
  api.useNativeBackLayer(async () => {
    closed++
    return true
  })
  api.useNativeBackLayer(async () => false)
  assert.equal(await api.closeNativeBackLayer(), true)
  assert.equal(closed, 1)
})
