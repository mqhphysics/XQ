import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const chrome = readFileSync(new URL('./dialog-chrome.h5.scss', import.meta.url), 'utf8')

test('desktop dialogs share a fixed landscape frame', () => {
  assert.match(chrome, /@media \(min-width:\s*721px\)/)
  assert.match(chrome, /width:\s*min\(920px,\s*calc\(100vw - 64px\)\)/)
  assert.match(chrome, /height:\s*min\(540px,\s*calc\(100dvh - 80px\)\)/)
  assert.match(chrome, /width:\s*min\(1120px,\s*calc\(100vw - 48px\)\)/)
  assert.match(chrome, /height:\s*min\(640px,\s*calc\(100dvh - 72px\)\)/)
  assert.match(chrome, /overflow:\s*hidden/)
  assert.match(chrome, /\.cm-dialog\.xq-dialog/)
})

test('dialog headers stay outside the scrolling body', () => {
  assert.match(chrome, /\.xq-dialog > \.xq-dialog__header/)
  assert.match(chrome, /flex:\s*0 0 auto/)
  assert.match(chrome, /\.xq-dialog > \.xq-dialog__body/)
  assert.match(chrome, /overflow-y:\s*auto/)
  assert.match(chrome, /min-height:\s*0/)
})
