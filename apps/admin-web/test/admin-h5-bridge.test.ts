import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { currentAdminUser, AdminApiError } from '../src/features/adminAuth/request.ts'
import {
  ADMIN_SESSION_KEY,
  H5_SESSION_KEY,
  createAdminSessionStore,
  createH5SessionBridge,
} from '../src/features/adminAuth/session.ts'
import { parseAdminUser } from '../src/features/adminAuth/types.ts'

const organizationId = '00000000-0000-4000-8000-000000000091'
const otherOrganizationId = '00000000-0000-4000-8000-000000000099'
const user = {
  id: '00000000-0000-4000-8000-000000000092',
  organizationId,
  displayName: 'FICTIONAL_TEST 管理员',
  roles: [{ role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: organizationId }],
}
const credential = (label = 'A') => ({
  accessToken: label.repeat(43),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
})

function storageFixture(session: unknown) {
  const values = new Map([[H5_SESSION_KEY, JSON.stringify({ data: session })]])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
  const bridge = createH5SessionBridge(storage, {
    organizationId,
    currentOrigin: 'https://site.example.invalid',
    h5Origin: 'https://site.example.invalid',
  })
  return { values, storage, bridge }
}

test('Taro session bridge restores only an unverified credential and discards cached privileges', () => {
  const login = credential()
  const fixture = storageFixture({ ...login, user, privateStudentId: 'PRIVATE_TEST' })
  fixture.values.set(ADMIN_SESSION_KEY, JSON.stringify({ ...credential('B'), user }))
  const store = createAdminSessionStore(fixture.storage, fixture.bridge)
  assert.deepEqual(store.getSnapshot().credential, login)
  assert.equal(store.getSnapshot().user, null)
  assert.equal(JSON.stringify(store.getSnapshot()).includes('PRIVATE_TEST'), false)
  assert.equal(store.verify(login.accessToken, parseAdminUser({ ...user, roles: [] })), false)
  assert.equal(store.getSnapshot().user, null)
})

test('a bridge cannot read another origin or accept a foreign organization', () => {
  let reads = 0
  const storage = {
    getItem: () => {
      reads += 1
      return JSON.stringify({ data: { ...credential(), user } })
    },
    removeItem: () => undefined,
  }
  const bridge = createH5SessionBridge(storage, {
    organizationId,
    currentOrigin: 'https://admin.example.invalid',
    h5Origin: 'https://site.example.invalid',
  })
  assert.equal(bridge.read(), null)
  bridge.clear(credential().accessToken)
  assert.equal(reads, 0)
  assert.equal(
    storageFixture({
      ...credential(),
      user: { ...user, organizationId: otherOrganizationId },
    }).bridge.read(),
    null,
  )
})

test('invalid, expired and malformed Taro credentials cannot become admin sessions', () => {
  for (const session of [
    null,
    { ...credential(), user: { ...user, id: 'not-a-user-id' } },
    { ...credential(), expiresAt: new Date(0).toISOString(), user },
    { ...credential(), expiresAt: 'broken', user },
    { ...credential(), accessToken: 'malformed token', user },
  ])
    assert.equal(storageFixture(session).bridge.read(), null)
  const fixture = storageFixture({ ...credential(), user })
  fixture.values.set(H5_SESSION_KEY, JSON.stringify({ ...credential(), user }))
  assert.equal(fixture.bridge.read(), null)
  fixture.values.set(H5_SESSION_KEY, '{broken')
  assert.equal(fixture.bridge.read(), null)
})

test('fresh identity must have exact management scope in this organization', () => {
  const login = credential()
  const fixture = storageFixture({ ...login, user })
  const store = createAdminSessionStore(fixture.storage, fixture.bridge)
  for (const identity of [
    { ...user, roles: [] },
    { ...user, roles: [{ role: 'TEAM_COACH', scopeType: 'TEAM', scopeId: user.id }] },
    {
      ...user,
      roles: [{ role: 'ORGANIZATION_ADMIN', scopeType: 'TEAM', scopeId: organizationId }],
    },
    {
      ...user,
      roles: [
        { role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: otherOrganizationId },
      ],
    },
    {
      ...user,
      organizationId: otherOrganizationId,
      roles: [
        { role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: otherOrganizationId },
      ],
    },
  ])
    assert.equal(store.verify(login.accessToken, parseAdminUser(identity)), false)
  assert.equal(store.verify(login.accessToken, parseAdminUser(user)), true)
  store.beginVerification(login.accessToken)
  assert.equal(store.getSnapshot().user, null)
})

test('logout removes the matching H5 adapter and cannot silently restore it on a new boot', () => {
  const login = credential()
  const fixture = storageFixture({ ...login, user })
  const store = createAdminSessionStore(fixture.storage, fixture.bridge)
  store.verify(login.accessToken, parseAdminUser(user))
  assert.equal(store.clear(login.accessToken, '已退出'), true)
  assert.equal(fixture.values.has(H5_SESSION_KEY), false)
  assert.equal(fixture.values.has(ADMIN_SESSION_KEY), false)
  assert.equal(
    createAdminSessionStore(fixture.storage, fixture.bridge).getSnapshot().credential,
    null,
  )
})

test('late logout cannot delete a newer H5 login', () => {
  const first = credential('A'),
    second = credential('B')
  const fixture = storageFixture({ ...first, user })
  const store = createAdminSessionStore(fixture.storage, fixture.bridge)
  fixture.values.set(H5_SESSION_KEY, JSON.stringify({ data: { ...second, user } }))
  store.clear(first.accessToken)
  assert.equal(fixture.bridge.read()?.accessToken, second.accessToken)
})

test('H5 account changes discard verified workspace and require a new live identity', () => {
  const first = credential('A'),
    second = credential('B')
  const fixture = storageFixture({ ...first, user })
  const store = createAdminSessionStore(fixture.storage, fixture.bridge)
  store.verify(first.accessToken, parseAdminUser(user))
  fixture.values.set(H5_SESSION_KEY, JSON.stringify({ data: { ...second, user } }))
  store.syncH5Session()
  assert.equal(store.getSnapshot().credential?.accessToken, second.accessToken)
  assert.equal(store.getSnapshot().user, null)
  assert.equal(store.verify(first.accessToken, parseAdminUser(user)), false)
  fixture.values.delete(H5_SESSION_KEY)
  store.syncH5Session()
  assert.equal(store.getSnapshot().credential, null)
})

test('an independent admin login works without an H5 session and an access denial preserves ordinary H5 login', () => {
  const fixture = storageFixture(null)
  const store = createAdminSessionStore(fixture.storage, fixture.bridge)
  const login = credential()
  store.start(login)
  store.syncH5Session()
  assert.equal(store.verify(login.accessToken, parseAdminUser(user)), true)
  fixture.values.set(
    H5_SESSION_KEY,
    JSON.stringify({ data: { ...login, user: { ...user, roles: [] } } }),
  )
  store.clear(login.accessToken, '未获管理授权', false)
  assert.equal(fixture.bridge.read()?.accessToken, login.accessToken)
})

test('live auth/me transport refuses revoked tokens and a different organization despite cached roles', async () => {
  let mode: 'valid' | 'revoked' | 'foreign' | 'removed-role' = 'valid'
  const login = credential()
  const fixture = storageFixture({ ...login, user })
  const store = createAdminSessionStore(fixture.storage, fixture.bridge)
  const server = createServer((request, response) => {
    assert.equal(request.url, '/api/auth/me')
    assert.equal(request.headers.authorization, `Bearer ${login.accessToken}`)
    assert.equal(request.headers['x-dev-role'], undefined)
    response.setHeader('content-type', 'application/json')
    if (mode === 'revoked') {
      response.writeHead(401).end(JSON.stringify({ message: 'FICTIONAL_TEST revoked' }))
    } else {
      const payload =
        mode === 'foreign'
          ? { ...user, organizationId: otherOrganizationId }
          : mode === 'removed-role'
            ? { ...user, roles: [] }
            : user
      response.end(JSON.stringify(payload))
    }
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const api = `http://127.0.0.1:${address.port}/api`
    assert.equal(
      store.verify(
        login.accessToken,
        await currentAdminUser(api, login.accessToken, undefined, organizationId),
      ),
      true,
    )
    mode = 'removed-role'
    store.beginVerification(login.accessToken)
    assert.equal(
      store.verify(
        login.accessToken,
        await currentAdminUser(api, login.accessToken, undefined, organizationId),
      ),
      false,
    )
    assert.equal(store.getSnapshot().user, null)
    mode = 'foreign'
    await assert.rejects(
      currentAdminUser(api, login.accessToken, undefined, organizationId),
      (error) => error instanceof AdminApiError && error.status === 403,
    )
    mode = 'revoked'
    await assert.rejects(
      currentAdminUser(api, login.accessToken, undefined, organizationId),
      (error) => error instanceof AdminApiError && error.status === 401,
    )
    store.clear(login.accessToken)
    assert.equal(fixture.bridge.read(), null)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    )
  }
})
