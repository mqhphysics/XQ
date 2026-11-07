import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(
  readFileSync(new URL('./routing.weapp.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText
function harness(pages) {
  const calls = [],
    module = { exports: {} }
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require(name) {
      if (name === '@tarojs/taro')
        return {
          default: {
            hideKeyboard: async () => {},
            getCurrentPages: () => pages,
            navigateBack: async () => {
              calls.push('back')
            },
            reLaunch: async ({ url }) => {
              calls.push(url)
            },
          },
        }
      if (name.includes('history.logic')) return { nativeTabPaths: { home: '/pages/index/index' } }
      if (name.includes('native-navigation/index'))
        return {
          readNativeHistory: () => ({ cursor: 0 }),
          stepNativeDetail: async () => {
            calls.push('embedded-back')
          },
        }
      return {}
    },
  })
  return { calls, api: module.exports }
}
test('publishing from the social package returns to its original page, preserving the background detail', async () => {
  const h = harness([{ route: 'pages/index/index' }, { route: 'social/compose/index' }])
  await h.api.finishNativeSocialPage('tournament')
  assert.deepEqual(h.calls, ['back'])
})
test('a standalone publishing deep link returns to the corresponding home competition', async () => {
  const h = harness([{ route: 'social/compose/index' }])
  await h.api.finishNativeSocialPage('tournament')
  assert.deepEqual(h.calls, ['/pages/index/index?tournamentId=tournament'])
})
