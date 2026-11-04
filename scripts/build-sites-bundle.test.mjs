import assert from 'node:assert/strict'
import { mkdtemp, mkdir, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import test from 'node:test'

import { assertOwnedOutput, sitesBuildEnvironment } from './build-sites-bundle.mjs'

const config = {
  TARO_APP_API_BASE_URL: 'https://api.example.invalid/',
  TARO_APP_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000091',
}

test('H5 and portal receive the same non-sensitive deployment configuration', () => {
  const env = sitesBuildEnvironment({
    ...config,
    VITE_API_BASE_URL: 'https://wrong.example.invalid',
  })
  assert.equal(env.VITE_API_BASE_URL, env.TARO_APP_API_BASE_URL)
  assert.equal(env.VITE_ORGANIZATION_ID, env.TARO_APP_ORGANIZATION_ID)
  assert.equal(env.VITE_H5_SESSION_BRIDGE, '1')
  assert.equal(env.VITE_LOCAL_SHORT_PASSWORDS, '0')
  assert.equal(env.TARO_APP_LOCAL_SHORT_PASSWORDS, '0')
  assert.equal(env.TARO_ENV, 'h5')
})

test('public build rejects credentials, insecure remote APIs and malformed organization IDs', () => {
  for (const api of [
    'https://user:secret@api.example.invalid',
    'http://api.example.invalid',
    'https://api.example.invalid?token=private',
    'https://api.example.invalid#fragment',
    '/api',
  ])
    assert.throws(() => sitesBuildEnvironment({ ...config, TARO_APP_API_BASE_URL: api }))
  assert.throws(() => sitesBuildEnvironment({ ...config, TARO_APP_ORGANIZATION_ID: 'broken' }))
  assert.equal(
    sitesBuildEnvironment({ ...config, TARO_APP_API_BASE_URL: 'http://127.0.0.1:3333' })
      .VITE_API_BASE_URL,
    'http://127.0.0.1:3333',
  )
})

test('build cannot remove or write output outside its repository or through a junction', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'xiaoqiu-portal-build-'))
  const root = join(fixture, 'repo')
  const outside = join(fixture, 'outside')
  await mkdir(root)
  await mkdir(outside)
  try {
    await assert.rejects(assertOwnedOutput(root, root))
    await assert.rejects(assertOwnedOutput(root, outside))
    assert.equal(
      await assertOwnedOutput(root, join(root, 'dist/admin')),
      resolve(await realpath(root), 'dist/admin'),
    )
    await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(assertOwnedOutput(root, join(root, 'linked/admin')))
  } finally {
    // fixture is the exact mkdtemp path created by this test, never user/project data.
    await rm(fixture, { recursive: true, force: true })
  }
})
