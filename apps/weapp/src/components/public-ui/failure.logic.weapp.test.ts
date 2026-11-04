import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeFailureHint } from './failure.logic.weapp.ts'
test('load failures distinguish account state and permissions from network recovery', () => {
  assert.equal(nativeFailureHint('登录状态已过期').kind, 'session')
  assert.equal(nativeFailureHint('当前账号没有权限').kind, 'permission')
  assert.equal(nativeFailureHint('此功能尚未开放').kind, 'service')
  assert.equal(nativeFailureHint('请求超时').kind, 'network')
})
