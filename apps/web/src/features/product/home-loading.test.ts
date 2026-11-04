import assert from 'node:assert/strict'
import test from 'node:test'

import { loadHomeWithEmptyState } from './home-loading.ts'

function httpError(statusCode: number) {
  return Object.assign(new Error('FICTIONAL_TEST response'), { statusCode })
}

test('an authenticated home 404 becomes empty only after a successful empty published list', async () => {
  const state = await loadHomeWithEmptyState(
    async () => {
      throw httpError(404)
    },
    async () => ({ items: [] }),
  )
  assert.deepEqual(state, { phase: 'empty' })
})

test('a stale configured tournament with other published tournaments remains an error', async () => {
  const error = httpError(404)
  await assert.rejects(
    loadHomeWithEmptyState(
      async () => {
        throw error
      },
      async () => ({ items: [{ id: 'fictional-published-tournament' }] }),
    ),
    (actual) => actual === error,
  )
})

test('network, expired session, permissions and server failures never become empty', async () => {
  for (const status of [0, 401, 403, 500, 503]) {
    const error = httpError(status)
    let listCalls = 0
    await assert.rejects(
      loadHomeWithEmptyState(
        async () => {
          throw error
        },
        async () => {
          listCalls++
          return { items: [] }
        },
      ),
      (actual) => actual === error,
    )
    assert.equal(listCalls, 0)
  }
})

test('a failed published list remains an error, including a session revoked between requests', async () => {
  for (const status of [0, 401, 403, 500]) {
    const listError = httpError(status)
    await assert.rejects(
      loadHomeWithEmptyState(
        async () => {
          throw httpError(404)
        },
        async () => {
          throw listError
        },
      ),
      (actual) => actual === listError,
    )
  }
})

test('a successful home keeps the real payload and does not request a second list', async () => {
  const data = { tournament: { id: 'fictional-published-tournament' } }
  let listCalls = 0
  assert.deepEqual(
    await loadHomeWithEmptyState(
      async () => data,
      async () => {
        listCalls++
        return { items: [] }
      },
    ),
    { phase: 'ready', data },
  )
  assert.equal(listCalls, 0)
})
