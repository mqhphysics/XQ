import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'

function fixture() {
  const state = [],
    calls = [],
    cooldowns = []
  let cursor = 0,
    closed = 0,
    failCode = false,
    remaining = 0
  class ProductApiError extends Error {
    statusCode = 429
    retryAfterSeconds = 90
  }
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in state)) state[i] = initial
      return [
        state[i],
        (value) => {
          state[i] = value
        },
      ]
    },
    useRef(initial) {
      const i = cursor++
      return (state[i] ??= { current: initial })
    },
  }
  const module = { exports: {} }
  const code = ts.transpileModule(
    readFileSync(new URL('./password-recovery.weapp.tsx', import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText
  vm.runInNewContext(code, {
    exports: module.exports,
    module,
    require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return jsx
      if (name === '@tarojs/components') return new Proxy({}, { get: (_, key) => String(key) })
      if (name === '@tarojs/taro') return { default: { showToast: async () => {} } }
      if (name.endsWith('/email-auth.repository.h5'))
        return {
          emailAuth: {
            requestCode: async (...args) => {
              calls.push(['code', ...args])
              if (failCode) throw new ProductApiError('too frequent')
              return { message: '受理', retryAfterSeconds: 60 }
            },
            resetPassword: async (...args) => {
              calls.push(['reset', ...args])
            },
          },
        }
      if (name.endsWith('/product.repository')) return { ProductApiError }
      if (name.endsWith('/countdown.weapp'))
        return {
          useEmailResendCountdown: () => ({ remaining }),
          startEmailCooldown: (...args) => cooldowns.push(args),
        }
      throw new Error(name)
    },
  })
  const flatten = (node) =>
    !node || typeof node !== 'object'
      ? []
      : Array.isArray(node)
        ? node.flatMap(flatten)
        : [node, ...flatten(node.props?.children)]
  const render = () => {
    cursor = 0
    return flatten(
      module.exports.NativePasswordRecovery({
        onClose: () => {
          closed++
        },
        onHelp: () => {},
      }),
    )
  }
  const input = (placeholder, value) =>
    render()
      .find((node) => node.type === 'Input' && node.props.placeholder === placeholder)
      .props.onInput({ detail: { value } })
  const click = async (text) => {
    const node = render().find((node) => node.type === 'Button' && node.props.children === text)
    assert(node)
    if (!node.props.disabled) node.props.onClick()
    await new Promise((resolve) => setImmediate(resolve))
  }
  return {
    calls,
    cooldowns,
    input,
    click,
    render,
    get closed() {
      return closed
    },
    fail: () => {
      failCode = true
    },
    cooldown: (value) => {
      remaining = value
    },
  }
}

test('native recovery sends RESET_PASSWORD codes, rejects mismatched passwords, then resets with the verified email', async () => {
  const f = fixture()
  f.input('请输入已绑定并验证的邮箱', 'student@example.test')
  await f.click('获取验证码')
  assert.deepEqual(f.calls[0], ['code', 'student@example.test', 'RESET_PASSWORD'])
  f.input('6位验证码', '123456')
  f.input('6至128位密码', 'test-password')
  f.input('再次输入新密码', 'different')
  await f.click('重置密码')
  assert.equal(f.calls.length, 1)
  f.input('再次输入新密码', 'test-password')
  await f.click('重置密码')
  assert.deepEqual(f.calls[1], ['reset', 'student@example.test', '123456', 'test-password'])
  assert.equal(f.closed, 1)
})

test('recovery honors server cooldown and clears the code when its email changes', async () => {
  const f = fixture()
  f.input('请输入已绑定并验证的邮箱', 'student@example.test')
  f.fail()
  await f.click('获取验证码')
  assert.deepEqual(f.cooldowns[0], ['student@example.test', 90])
  f.cooldown(90)
  await f.click('90秒后重发')
  assert.equal(f.calls.length, 1)
  f.input('6位验证码', '123456')
  f.input('请输入已绑定并验证的邮箱', 'other@example.test')
  const code = f
    .render()
    .find((node) => node.type === 'Input' && node.props.placeholder === '6位验证码')
  assert.equal(code.props.value, '')
})
