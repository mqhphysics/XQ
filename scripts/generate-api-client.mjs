/* global fetch, AbortSignal */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const input = process.argv[2] || resolve(repository, 'packages/api-client/openapi.json')
const source = /^https?:\/\//.test(input)
  ? await (await fetch(input, { signal: AbortSignal.timeout(10000) })).text()
  : await readFile(resolve(input), 'utf8')
const document = JSON.parse(source)
if (!document.openapi || !document.paths) throw new Error('API did not return an OpenAPI document')
const snapshot = resolve(repository, 'packages/api-client/openapi.json')
await mkdir(dirname(snapshot), { recursive: true })
await writeFile(snapshot, JSON.stringify(document, null, 2) + '\n')
const generated = resolve(repository, 'packages/api-client/src/generated')
const previous = new Map()
for (const entry of await readdir(generated, { recursive: true })) {
  if (entry.endsWith('.ts')) previous.set(entry, await readFile(resolve(generated, entry), 'utf8'))
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const arguments_ = [
  'exec',
  '--yes',
  '--package=openapi-typescript-codegen@0.29.0',
  '--',
  'openapi',
  '--input',
  snapshot,
  '--output',
  resolve(repository, 'packages/api-client/src/generated'),
  '--client',
  'fetch',
  '--useUnionTypes',
]
const child =
  process.platform === 'win32'
    ? spawnSync(
        process.execPath,
        [resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...arguments_],
        { cwd: repository, stdio: 'inherit', windowsHide: true },
      )
    : spawnSync(npm, arguments_, { cwd: repository, stdio: 'inherit' })
if (child.status !== 0) process.exit(child.status ?? 1)

// Preserve unchanged declarations; normalize new output without creating formatting-only diffs.
const normalized = (code) => code.replace(/\r\n/g, '\n').trimEnd() + '\n'
for (const entry of await readdir(generated, { recursive: true })) {
  if (!entry.endsWith('.ts')) continue
  const file = resolve(generated, entry)
  const code = await readFile(file, 'utf8')
  const before = previous.get(entry)
  await writeFile(
    file,
    before !== undefined && normalized(code) === normalized(before) ? before : normalized(code),
  )
}
