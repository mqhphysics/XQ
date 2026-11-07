import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'

const source = ts.transpileModule(
  readFileSync(new URL('./screen.weapp.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  },
).outputText
const module = { exports: {} }
vm.runInNewContext(source, {
  module,
  exports: module.exports,
  require(name) {
    if (name === 'react/jsx-runtime') return jsx
    if (name === '@tarojs/taro') return { getCurrentInstance: () => ({ router: { params: {} } }) }
    if (name === './direct.weapp') return { default: 'DirectMessages' }
    if (name === './notifications.weapp') return { default: 'Notifications' }
    if (name === './settings.weapp') return { MessageSettings: 'Settings' }
    return {}
  },
})
const render = module.exports.default
test('message root and legacy private link share the same single inbox home', () => {
  assert.equal(render({}).type.name, 'MessageHome')
  assert.equal(render({ private: '1' }).type.name, 'MessageHome')
})
test('reply and mention links enter one category while threads and search remain independent', () => {
  const replies = render({ category: 'mentions' })
  assert.equal(replies.type, 'Notifications')
  assert.equal(replies.props.category, 'replies')
  assert.equal(render({ conversationId: 'conversation' }).type, 'DirectMessages')
  assert.equal(render({ new: '1' }).type, 'DirectMessages')
  assert.equal(render({ category: 'settings' }).type, 'Settings')
})
test('old notification detail URLs retain precedence and do not fall into the private list', () => {
  assert.equal(
    render({ notificationId: 'notice', private: '1', conversationId: 'old-link' }).type,
    'Notifications',
  )
})
