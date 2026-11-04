import assert from 'node:assert/strict'
import test from 'node:test'
import { corsOriginMatcher } from '../app.setup'

function allowed(entries: string[], origin: string): boolean {
  return corsOriginMatcher(entries).some((rule) =>
    typeof rule === 'string' ? rule === origin : rule.test(origin),
  )
}

test('CORS wildcard entries match Pages preview subdomains only', () => {
  const entries = ['https://xiaoqiu-beta.pages.dev', 'https://*.xiaoqiu-beta.pages.dev']
  assert.ok(allowed(entries, 'https://xiaoqiu-beta.pages.dev'))
  assert.ok(allowed(entries, 'https://3f2a1b.xiaoqiu-beta.pages.dev'))
  assert.ok(allowed(entries, 'https://feat-x.xiaoqiu-beta.pages.dev'))
  assert.ok(!allowed(entries, 'http://3f2a1b.xiaoqiu-beta.pages.dev'))
  assert.ok(!allowed(entries, 'https://evil-xiaoqiu-beta.pages.dev'))
  assert.ok(!allowed(entries, 'https://xiaoqiu-beta.pages.dev.evil.com'))
  assert.ok(!allowed(entries, 'https://other.pages.dev'))
  assert.ok(!allowed(entries, 'https://a.xiaoqiu-beta.pages.dev:8443'))
})
