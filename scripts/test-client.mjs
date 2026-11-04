import fs from 'node:fs'
import process from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const app = process.argv[2]
if (!['weapp', 'web'].includes(app)) throw new Error('Expected weapp or web')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const files = []
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) visit(full)
    else if (/\.test\.(?:ts|mjs)$/.test(entry.name)) files.push(full)
  }
}
visit(path.join(root, 'apps', app, 'src'))
const result = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--test', '--experimental-strip-types', ...files], { stdio: 'inherit', windowsHide: true })
process.exit(result.status ?? 1)
