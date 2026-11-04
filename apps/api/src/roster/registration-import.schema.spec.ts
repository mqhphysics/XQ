import assert from 'node:assert/strict'
import test from 'node:test'

import { ERROR_CODES } from '@xiaoqiu/contracts'

import {
  RegistrationImportError,
  createPlayerIdentity,
  maskStudentId,
  parseRegistrationImportDocument,
} from './registration-import.schema'

const MATCHING_SECRET = 'fictional-test-secret-2026'

test('registration schema preserves string shirt numbers and creates stable opaque identities', () => {
  const document = parseRegistrationImportDocument({
    schemaVersion: 1,
    team: {
      teamCode: 'FAKE-TEAM-01',
      name: '虚构测试队',
    },
    players: [
      {
        displayName: '虚构球员甲',
        shirtNumber: '01',
        studentId: 'FAKE-2026-0001',
      },
    ],
  })
  const firstPlayer = document.players[0]

  assert.ok(firstPlayer)
  assert.equal(firstPlayer.shirtNumber, '01')
  assert.equal(firstPlayer.studentIdMasked, 'FA********01')

  const identityA = createPlayerIdentity(
    '00000000-0000-4000-8000-000000000001',
    firstPlayer,
    MATCHING_SECRET,
  )
  const identityB = createPlayerIdentity(
    '00000000-0000-4000-8000-000000000001',
    firstPlayer,
    MATCHING_SECRET,
  )

  assert.deepEqual(identityA, identityB)
  assert.equal(identityA.sourceKey.length, 64)
  assert.equal(identityA.sourceKey.includes(firstPlayer.identityValue), false)
})

test('same display names remain valid when stable identities differ', () => {
  const document = parseRegistrationImportDocument({
    schemaVersion: 1,
    team: {
      teamCode: 'FAKE-TEAM-02',
      name: '虚构同名测试队',
    },
    players: [
      { displayName: '虚构同名球员', stableKey: 'FAKE-STABLE-A' },
      { displayName: '虚构同名球员', stableKey: 'FAKE-STABLE-B' },
    ],
  })

  assert.deepEqual(document.warningCodes, ['DUPLICATE_DISPLAY_NAME'])
  assert.equal(document.players.length, 2)
})

test('duplicate stable identities are rejected without exposing input values', () => {
  assert.throws(
    () =>
      parseRegistrationImportDocument({
        schemaVersion: 1,
        team: {
          teamCode: 'FAKE-TEAM-03',
          name: '虚构冲突测试队',
        },
        players: [
          { displayName: '虚构球员乙', studentId: 'FAKE-2026-0002' },
          { displayName: '虚构球员丙', studentId: 'FAKE-2026-0002' },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof RegistrationImportError)
      assert.equal(error.code, ERROR_CODES.REGISTRATION_IMPORT_INVALID)
      assert.deepEqual(error.issueCodes, ['DUPLICATE_PLAYER_STABLE_ID'])
      assert.equal(error.message.includes('FAKE-2026-0002'), false)
      return true
    },
  )
})

test('student identifier masking never returns the original value', () => {
  assert.equal(maskStudentId('FAKE-2026-0099'), 'FA********99')
  assert.equal(maskStudentId('ABCD'), '****')
})
