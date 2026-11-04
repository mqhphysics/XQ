import assert from 'node:assert/strict'
import test from 'node:test'
import { readAdminResponse } from '../src/features/adminAuth/request.ts'

test('parallel identical admin reads share HTTP while keeping independent result objects', async () => {
  const before = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return new Response(JSON.stringify({ value: 1 }), { status: 200 })
  }
  try {
    const [one, two] = await Promise.all([
      readAdminResponse('https://example.test/overview', {}),
      readAdminResponse('https://example.test/overview', {}),
    ])
    assert.equal(calls, 1)
    ;(one.payload as { value: number }).value = 2
    assert.equal((two.payload as { value: number }).value, 1)
    await readAdminResponse('https://example.test/overview', {})
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = before
  }
})

test('admin credentials and writes split in-flight read groups', async () => {
  const before = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return new Response('{}', { status: 200 })
  }
  try {
    await Promise.all([
      readAdminResponse('https://example.test/view', { headers: { authorization: 'Bearer a' } }),
      readAdminResponse('https://example.test/view', { headers: { authorization: 'Bearer b' } }),
    ])
    assert.equal(calls, 2)
    const first = readAdminResponse('https://example.test/view', {})
    const mutation = readAdminResponse('https://example.test/update', { method: 'POST' })
    const next = readAdminResponse('https://example.test/view', {})
    await Promise.all([first, mutation, next])
    assert.equal(calls, 5)
  } finally {
    globalThis.fetch = before
  }
})
