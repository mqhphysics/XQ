import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'

import {
  AdminApiError,
  readAdminResponse,
  requestAdmin,
} from '../src/features/adminAuth/request.ts'
import {
  ADMIN_SESSION_KEY,
  adminSession,
  createAdminSessionStore,
} from '../src/features/adminAuth/session.ts'
import { adminKind, parseAdminUser } from '../src/features/adminAuth/types.ts'

const organizationId = '00000000-0000-4000-8000-000000000091'
const user = parseAdminUser({
  id: '00000000-0000-4000-8000-000000000092',
  organizationId,
  displayName: 'FICTIONAL_TEST 管理员',
  roles: [{ role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: organizationId }],
  studentId: 'PRIVATE-TEST',
  email: 'fictional@example.invalid',
})
const credential = (label: string) => ({
  accessToken: label.repeat(43),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
})
const originalFetch = globalThis.fetch
const secondUser = {
  ...user,
  id: '00000000-0000-4000-8000-000000000093',
  displayName: 'FICTIONAL_TEST 第二管理员',
}
afterEach(() => {
  globalThis.fetch = originalFetch
  const token = adminSession.getSnapshot().credential?.accessToken
  if (token) adminSession.clear(token)
})

test('restored storage never restores cached user or role authority', () => {
  const saved = { ...credential('A'), roles: user.roles, user, studentId: 'PRIVATE-TEST' }
  const store = createAdminSessionStore({
    getItem: () => JSON.stringify(saved),
    setItem: () => undefined,
    removeItem: () => undefined,
  })
  assert.ok(store.getSnapshot().credential)
  assert.equal(store.getSnapshot().user, null)
})

test('expired or malformed expiry credentials are refused', () => {
  for (const expiresAt of ['broken', '', new Date(0).toISOString()]) {
    const store = createAdminSessionStore({
      getItem: () => JSON.stringify({ ...credential('A'), expiresAt }),
      setItem: () => undefined,
      removeItem: () => undefined,
    })
    assert.equal(store.getSnapshot().credential, null)
    assert.throws(() => store.start({ ...credential('A'), expiresAt }))
  }
})

test('storage contains only token/expiry and minimal identity strips private fields', () => {
  let saved = ''
  const store = createAdminSessionStore({
    getItem: () => null,
    setItem: (key, value) => {
      assert.equal(key, ADMIN_SESSION_KEY)
      saved = value
    },
    removeItem: () => undefined,
  })
  const login = credential('A')
  store.start(login)
  store.verify(login.accessToken, user)
  assert.deepEqual(Object.keys(JSON.parse(saved)).sort(), ['accessToken', 'expiresAt'])
  assert.ok(!JSON.stringify(store.getSnapshot()).includes('PRIVATE-TEST'))
  assert.ok(!JSON.stringify(store.getSnapshot()).includes('fictional@example.invalid'))
  assert.equal(adminKind(user), 'ORGANIZATION_ADMIN')
  assert.equal(
    adminKind({
      ...user,
      roles: [
        {
          role: 'ORGANIZATION_ADMIN',
          scopeType: 'ORGANIZATION',
          scopeId: '00000000-0000-4000-8000-000000000099',
        },
      ],
    }),
    null,
  )
})

test('storage unavailable does not crash login but still requires live identity validation', () => {
  const store = createAdminSessionStore({
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
    removeItem: () => {
      throw new Error('blocked')
    },
  })
  store.start(credential('A'))
  assert.equal(store.getSnapshot().user, null)
  assert.ok(store.getSnapshot().credential)
})

test('old 401 cannot clear a newly signed in account', async () => {
  const first = credential('A'),
    second = credential('B')
  adminSession.start(first)
  adminSession.verify(first.accessToken, user)
  let resolve!: (value: Response) => void
  globalThis.fetch = () =>
    new Promise((done) => {
      resolve = done
    })
  const pending = requestAdmin(
    '/api',
    { accessToken: first.accessToken, organizationId },
    '/admin/schedule-workbench',
  )
  adminSession.start(second)
  adminSession.verify(second.accessToken, secondUser)
  resolve(new Response(JSON.stringify({ message: 'expired' }), { status: 401 }))
  await assert.rejects(pending, (error) => error instanceof AdminApiError && error.status === 409)
  assert.equal(adminSession.getSnapshot().credential?.accessToken, second.accessToken)
  assert.equal(adminSession.getSnapshot().user?.id, secondUser.id)
})

test('old success whose JSON is delayed cannot populate the new account workspace', async () => {
  const first = credential('A'),
    second = credential('B')
  adminSession.start(first)
  adminSession.verify(first.accessToken, user)
  let resolveBody!: (value: unknown) => void
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: () =>
        new Promise((done) => {
          resolveBody = done
        }),
    }) as Response
  const pending = requestAdmin(
    '/api',
    { accessToken: first.accessToken, organizationId },
    '/admin/schedule-workbench',
  )
  await Promise.resolve()
  adminSession.start(second)
  adminSession.verify(second.accessToken, secondUser)
  resolveBody({ privateWorkspace: 'previous account' })
  await assert.rejects(pending, (error) => error instanceof AdminApiError && error.status === 409)
  assert.equal(adminSession.getSnapshot().credential?.accessToken, second.accessToken)
  assert.equal(adminSession.getSnapshot().user?.id, secondUser.id)
})

test('fresh 401 clears only its own session and requests use Bearer without development headers', async () => {
  const login = credential('A')
  adminSession.start(login)
  adminSession.verify(login.accessToken, user)
  globalThis.fetch = async (_url, init) => {
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('authorization'), `Bearer ${login.accessToken}`)
    assert.equal(headers.get('x-organization-id'), organizationId)
    assert.equal(headers.has('x-dev-role'), false)
    assert.equal(headers.has('x-dev-user-id'), false)
    assert.equal(headers.has('x-dev-organization-id'), false)
    assert.equal(init?.cache, 'no-store')
    return new Response(JSON.stringify({ message: 'expired' }), { status: 401 })
  }
  await assert.rejects(
    requestAdmin(
      '/api',
      { accessToken: login.accessToken, organizationId },
      '/admin/schedule-workbench',
    ),
  )
  assert.equal(adminSession.getSnapshot().credential, null)
})

test('old identity and logout completion cannot overwrite or clear a new session', () => {
  const store = createAdminSessionStore()
  const first = credential('A'),
    second = credential('B')
  store.start(first)
  store.start(second)
  assert.equal(store.verify(first.accessToken, user), false)
  assert.equal(store.clear(first.accessToken), false)
  assert.equal(store.verify(second.accessToken, user), true)
  assert.equal(store.getSnapshot().credential?.accessToken, second.accessToken)
})

test('network deadline also aborts a response body that never completes', async () => {
  globalThis.fetch = async (_url, init) =>
    ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        }),
    }) as Response
  await assert.rejects(
    readAdminResponse('/api/auth/me', {}, 5),
    (error) => error instanceof AdminApiError && error.code === 'REQUEST_TIMEOUT',
  )
})

test('an explicit cancellation is distinct from a deadline failure', async () => {
  const controller = new AbortController()
  globalThis.fetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('caller cancelled')), {
        once: true,
      })
    })
  const pending = readAdminResponse('/api/auth/me', { signal: controller.signal }, 1000)
  controller.abort()
  await assert.rejects(
    pending,
    (error) => error instanceof Error && !(error instanceof AdminApiError),
  )
})
