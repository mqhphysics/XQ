import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { safeLoginReturn } from './login-return.logic.ts'
const source = ts.transpileModule(
  readFileSync(new URL('./login-return.weapp.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText
async function target(route) {
  let saved
  const module = { exports: {} }
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    Date,
    require(name) {
      if (name === '@tarojs/taro')
        return {
          default: {
            showModal: async () => ({ confirm: true }),
            getCurrentInstance: () => ({ router: route }),
            setStorageSync: (_key, value) => {
              saved = value
            },
            reLaunch: async () => {},
          },
        }
      if (name.includes('native-navigation/index'))
        return {
          readNativeHistory: () => ({
            cursor: 0,
            entries: [{ url: '/pages/post-detail/index?postId=background' }],
          }),
        }
      if (name.includes('history.logic')) return { nativeTabPaths: { home: '/pages/index/index' } }
      return { safeLoginReturn }
    },
  })
  await module.exports.requestNativeLogin()
  return saved.url
}
test('login return preserves the physical public post instead of an unrelated background detail', async () => {
  assert.equal(
    await target({
      path: '/pages/post-detail/index',
      params: { postId: 'foreground', tournamentId: 't' },
    }),
    '/pages/post-detail/index?postId=foreground&tournamentId=t',
  )
})
test('a private subpackage page never restores the previous account conversation on login', async () => {
  assert.equal(
    await target({ path: '/social/messages/index', params: { conversationId: 'private' } }),
    '/pages/index/index',
  )
})
