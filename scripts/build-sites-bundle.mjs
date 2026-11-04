import { spawn } from 'node:child_process'
import console from 'node:console'
import { cp, lstat, mkdir, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { URL, fileURLToPath, pathToFileURL } from 'node:url'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function sitesBuildEnvironment(environment) {
  const organizationId = environment.TARO_APP_ORGANIZATION_ID?.trim().toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(organizationId ?? ''))
    throw new Error('TARO_APP_ORGANIZATION_ID must be the non-sensitive organization UUID.')
  let api
  try {
    api = new URL(environment.TARO_APP_API_BASE_URL?.trim())
  } catch {
    throw new Error('TARO_APP_API_BASE_URL must be an absolute API URL.')
  }
  if (
    !['https:', 'http:'].includes(api.protocol) ||
    api.username ||
    api.password ||
    api.search ||
    api.hash ||
    !['/', '/api', '/api/'].includes(api.pathname) ||
    (api.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(api.hostname))
  )
    throw new Error(
      'Use HTTPS for the public API, or HTTP loopback for isolated QA; no credentials.',
    )
  const apiBase = api.href.replace(/\/+$/, '')
  return {
    ...environment,
    NODE_ENV: 'production',
    TARO_ENV: 'h5',
    TARO_APP_API_BASE_URL: apiBase,
    TARO_APP_ORGANIZATION_ID: organizationId,
    TARO_APP_LOCAL_SHORT_PASSWORDS: '0',
    VITE_API_BASE_URL: apiBase,
    VITE_ORGANIZATION_ID: organizationId,
    VITE_LOCAL_SHORT_PASSWORDS: '0',
    VITE_H5_SESSION_BRIDGE: '1',
  }
}

export async function assertOwnedOutput(root, output) {
  const canonicalRoot = await realpath(root)
  const absolute = resolve(output)
  const child = relative(resolve(root), absolute)
  if (!child || isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`))
    throw new Error('Build output must stay inside this repository.')
  // Reject a junction/symlink in every existing path component before a build deletes output.
  let current = canonicalRoot
  for (const component of child.split(sep)) {
    current = resolve(current, component)
    let info
    try {
      info = await lstat(current)
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    if (info.isSymbolicLink())
      throw new Error('Build output cannot traverse a symlink or junction.')
  }
  return resolve(canonicalRoot, child)
}

async function assertRegularTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Admin output cannot contain symlinks.')
    if (entry.isDirectory()) await assertRegularTree(resolve(directory, entry.name))
  }
}

async function runNode(script, args, cwd, env) {
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      env,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) done()
      else reject(new Error(`Production build failed (${signal ?? code}).`))
    })
  })
}

export async function buildSitesBundle(environment = process.env) {
  const env = sitesBuildEnvironment(environment)
  const root = await realpath(repository)
  const h5Root = resolve(root, 'apps/web')
  const adminRoot = resolve(root, 'apps/admin-web')
  const h5Output = await assertOwnedOutput(root, resolve(h5Root, 'dist'))
  const adminOutput = await assertOwnedOutput(root, resolve(adminRoot, 'dist'))
  const bundledAdmin = await assertOwnedOutput(root, resolve(h5Output, 'admin'))
  const rootRequire = createRequire(resolve(root, 'package.json'))
  const h5Require = createRequire(resolve(h5Root, 'package.json'))
  const adminRequire = createRequire(resolve(adminRoot, 'package.json'))
  await runNode(
    rootRequire.resolve('typescript/bin/tsc'),
    ['-b', '--pretty', 'false'],
    adminRoot,
    env,
  )
  await runNode(
    resolve(dirname(h5Require.resolve('@tarojs/cli/package.json')), 'bin/taro'),
    ['build', '--type', 'h5'],
    h5Root,
    env,
  )
  await runNode(
    resolve(dirname(adminRequire.resolve('vite/package.json')), 'bin/vite.js'),
    ['build', '--base', '/admin/'],
    adminRoot,
    env,
  )
  await lstat(resolve(h5Output, 'index.html'))
  await lstat(resolve(adminOutput, 'index.html'))
  await assertRegularTree(adminOutput)
  await assertOwnedOutput(root, bundledAdmin)
  await rm(bundledAdmin, { recursive: true, force: true })
  await mkdir(bundledAdmin, { recursive: true })
  await cp(adminOutput, bundledAdmin, { recursive: true, dereference: false })
  await writeFile(
    resolve(h5Output, 'site-bundle.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        adminBase: '/admin/',
        apiBaseUrl: env.TARO_APP_API_BASE_URL,
        organizationId: env.TARO_APP_ORGANIZATION_ID,
        h5SessionBridge: true,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  console.log('Sites bundle ready: apps/web/dist (management portal at /admin/).')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildSitesBundle()
}
