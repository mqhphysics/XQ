import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const appRoot = fileURLToPath(new URL('../../../', import.meta.url))

test('retired UI nodes never render a literal null label in either client', () => {
  const invalid = []
  for (const app of ['weapp', 'web']) {
    const root = path.resolve(appRoot, '..', app, 'src')
    const visitFile = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) visitFile(full)
        else if (entry.name.endsWith('.tsx')) {
          const source = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
          const walk = (node) => {
            if (ts.isJsxText(node) && /^null(?:\s+null)*$/.test(node.text.trim())) invalid.push(full)
            ts.forEachChild(node, walk)
          }
          walk(source)
        }
      }
    }
    visitFile(root)
  }
  assert.deepEqual(invalid, [])
})

