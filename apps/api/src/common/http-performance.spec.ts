import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { createRequire } from 'node:module'
import type expressType from 'express'

import { compressResponse } from './http-performance'

// express is a transitive dependency of @nestjs/platform-express, not a direct one; resolve it through Nest.
const express = createRequire(require.resolve('@nestjs/platform-express'))(
  'express',
) as typeof expressType

test('public JSON is brotli compressed and keeps a strong etag', async () => {
  const app = express()
  app.set('etag', 'strong')
  app.use(compressResponse)
  app.get('/api/public/home', (_request, response) => {
    response.json({ tournament: { id: 'demo', name: '校园联赛'.repeat(400) } })
  })
  const server = createServer(app)
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  const port = (server.address() as AddressInfo).port
  try {
    const first = await fetch(`http://127.0.0.1:${port}/api/public/home`, {
      headers: { 'accept-encoding': 'br', 'cache-control': '' },
    })
    const etag = first.headers.get('etag')
    assert.equal(first.headers.get('content-encoding'), 'br')
    assert.match(etag ?? '', /^"(?:W\/)?.+"$/)
    const json = (await first.json()) as { tournament: { id: string } }
    assert.equal(json.tournament.id, 'demo')
    const again = await fetch(`http://127.0.0.1:${port}/api/public/home`, {
      headers: { 'accept-encoding': 'br', 'cache-control': '', 'if-none-match': etag ?? '' },
    })
    assert.equal(again.status, 304)
  } finally {
    await new Promise<void>((ready, reject) =>
      server.close((error) => (error ? reject(error) : ready())),
    )
  }
})

test(
  'media chunks arrive before end without buffering or compression',
  { timeout: 10000 },
  async (context) => {
    const app = express()
    let release: () => void = () => {}
    app.use(compressResponse)
    app.get('/clip', (_request, response) => {
      response.type('video/mp4')
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      response.write(Buffer.from([1, 2, 3, 4]))
      void gate.then(() => response.end(Buffer.from([5, 6, 7, 8])))
    })
    const server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const response = await fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/clip`,
        { headers: { 'accept-encoding': 'gzip' }, signal: context.signal },
      )
      assert.equal(response.headers.get('content-encoding'), null)
      const reader = response.body!.getReader(),
        first = await reader.read()
      assert.deepEqual([...first.value!], [1, 2, 3, 4])
      release()
      const rest: number[] = []
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        rest.push(...chunk.value)
      }
      assert.deepEqual(rest, [5, 6, 7, 8])
    } finally {
      release()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  },
)
