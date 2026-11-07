import assert from 'node:assert/strict'
import test from 'node:test'
import { studentNumberLabel } from './student-registration-display.logic.ts'

test('submitted student numbers are clearly pending and never override verified information', () => {
  assert.equal(
    studentNumberLabel(null, [{ status: 'PENDING', studentNumber: '2026999001' }]),
    '2026999001（待核验）',
  )
  assert.equal(
    studentNumberLabel(null, [{ status: 'RETURNED', studentNumber: '2026999001' }]),
    '2026999001（待更正）',
  )
  assert.equal(
    studentNumberLabel('2026999002', [{ status: 'PENDING', studentNumber: '2026999001' }]),
    '2026999002',
  )
})
test('approved, absent or invalid claims do not fabricate a pending number', () => {
  assert.equal(studentNumberLabel(null, []), '')
  assert.equal(
    studentNumberLabel(null, [
      { status: 'APPROVED', studentNumber: '2026999001' },
      { status: 'PENDING', studentNumber: '2026999002' },
    ]),
    '',
  )
  assert.equal(studentNumberLabel(null, [{ status: 'PENDING', studentNumber: 'invalid' }]), '')
})
