import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeFailureHint } from './failure.logic.weapp.ts'
test('load failures distinguish account state and permissions from network recovery', () => {
  assert.equal(nativeFailureHint('登录状态已过期').kind, 'session')
  assert.equal(nativeFailureHint('当前账号没有权限').kind, 'permission')
  assert.equal(nativeFailureHint('此功能尚未开放').kind, 'service')
  assert.equal(nativeFailureHint('请求超时').kind, 'network')
  assert.equal(nativeFailureHint('动态不存在').kind, 'missing')
  assert.equal(nativeFailureHint('内容已撤回').kind, 'missing')
  assert.equal(nativeFailureHint('请求失败（HTTP 404）').kind, 'missing')
  assert.equal(nativeFailureHint('请求失败（HTTP 503）').kind, 'service')
  assert.equal(nativeFailureHint('请求参数校验失败').kind, 'service')
  assert.equal(nativeFailureHint('请求失败（HTTP 429）').kind, 'service')
})
