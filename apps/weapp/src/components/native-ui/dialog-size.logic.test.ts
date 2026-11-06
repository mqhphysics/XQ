import assert from 'node:assert/strict'
import test from 'node:test'
import { dialogBodyHeight } from './dialog-size.logic.ts'
test('async dialogs never collapse around a loading label, fixed identity forms keep their expected size', () => {
  const base = { compact: true, contentHeight: null, minBodyHeight: 240, loading: false }
  assert.equal(dialogBodyHeight(844, base), 240)
  assert.equal(dialogBodyHeight(844, { ...base, contentHeight: 24 }), 240)
  assert.equal(
    dialogBodyHeight(844, { ...base, bodyHeight: 380, loading: true, contentHeight: 24 }),
    380,
  )
  assert.equal(dialogBodyHeight(844, { ...base, bodyHeight: 380, contentHeight: 600 }), 380)
  assert.equal(dialogBodyHeight(300, { ...base, bodyHeight: 380 }), 140)
})
