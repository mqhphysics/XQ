import assert from 'node:assert/strict'
import test from 'node:test'
import {
  commandHash,
  maskEmail,
  maskIdentity,
  publicProfilePatch,
  safeAuditSummary,
} from './admin-center.policy'

test('management lists mask identities and email addresses', () => {
  assert.equal(maskIdentity('1234567890'), '12****90')
  assert.equal(maskIdentity('123'), '****')
  assert.equal(maskIdentity(null), null)
  assert.equal(maskEmail('student@example.test'), 's***@example.test')
})

test('profile changes reject immutable keys, relationships and prototype fields', () => {
  for (const field of [
    'id',
    'organizationId',
    'sourceKey',
    'teamMemberships',
    'constructor',
    '__proto__',
  ]) {
    assert.throws(() => publicProfilePatch('PlayerProfile', JSON.parse(`{"${field}":"changed"}`)))
  }
  assert.deepEqual(
    publicProfilePatch('Team', { name: ' New name ', shortName: '', primaryColor: '#0a123f' }),
    { name: 'New name', shortName: null, primaryColor: '#0a123f' },
  )
  assert.throws(() => publicProfilePatch('Team', { primaryColor: 'red' }))
  assert.throws(() => publicProfilePatch('PlayerProfile', { heightCm: 999 }))
})

test('legacy audit summaries cannot reveal identities, content, credentials or arbitrary nested data', () => {
  const output = safeAuditSummary({
    version: 3,
    status: 'ACTIVE',
    studentId: 'private-id',
    passwordHash: 'private-hash',
    email: 'private-mail',
    fields: { studentId: 'private-id' },
    body: 'private-message',
    changedFields: ['displayName', 'body', 'invalid field'],
  })
  assert.deepEqual(output, { version: 3, status: 'ACTIVE', changedFields: ['displayName', 'body'] })
  assert.equal(safeAuditSummary(['private-id']), null)
})

test('idempotency hashes preserve command content while ignoring object property order', () => {
  assert.equal(commandHash({ a: 1, b: { c: 2, d: 3 } }), commandHash({ b: { d: 3, c: 2 }, a: 1 }))
  assert.notEqual(commandHash({ status: 'ACTIVE' }), commandHash({ status: 'SUSPENDED' }))
})
