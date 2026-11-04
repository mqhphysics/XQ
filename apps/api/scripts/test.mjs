import fs from 'node:fs'
import console from 'node:console'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2] || 'unit'
if (!['unit', 'integration', 'all'].includes(mode)) throw new Error('Expected unit, integration or all')
if (mode !== 'unit' && !process.env.TEST_DATABASE_URL)
  throw new Error('TEST_DATABASE_URL must name a dedicated test database; no default or production database is used.')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const specs = []
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) visit(full)
    else if (entry.name.endsWith('.spec.js')) specs.push(full)
  }
}
visit(path.join(root, 'dist/test'))
const databaseSpec = (file) => file.includes('.postgres.integration.') || file.endsWith(path.join('integration', 'real-match-workflow.spec.js')) || file.endsWith(path.join('database', 'database.integration.spec.js'))
const selected = specs.filter((file) => mode === 'all' || (mode === 'integration' ? databaseSpec(file) : !databaseSpec(file)))
console.log(mode + ': ' + selected.length + ' spec files; ' + (specs.length - selected.length) + ' files outside this test mode.')
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...selected], { cwd: root, stdio: 'inherit', windowsHide: true })
process.exit(result.status ?? 1)
