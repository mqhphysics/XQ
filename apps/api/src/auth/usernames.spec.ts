import assert from 'node:assert/strict'
import test from 'node:test'
import { usernameStem, threeDigitUsername, reserveLoginAlias } from './usernames'
import type { Prisma } from '../generated/prisma/client'

test('real names become lower-case surname-aware pinyin, never nicknames or IDs', () => {
  assert.equal(usernameStem('邓德阳'), 'dengdeyang')
  assert.equal(usernameStem('单宇'), 'shanyu')
  assert.equal(usernameStem('欧阳明'), 'ouyangming')
  assert.equal(usernameStem('  Alice Émile  '), 'aliceemile')
  assert.equal(usernameStem(''), '')
})
test('random suffix collision checks wrap all three digits and fail before assigning duplicates', () => {
  assert.equal(
    threeDigitUsername('dengdeyang', new Set(['dengdeyang999', 'dengdeyang000']), 999),
    'dengdeyang001',
  )
  assert.throws(() =>
    threeDigitUsername(
      'a',
      new Set(Array.from({ length: 1000 }, (_, i) => 'a' + String(i).padStart(3, '0'))),
      0,
    ),
  )
})
test('old login aliases cannot be reassigned to a different user', async () => {
  let writes = 0
  const tx = {
    user: { findFirst: async () => null },
    userLoginAlias: {
      findUnique: async () => ({ userId: 'owner' }),
      create: async () => {
        writes++
      },
    },
  } as unknown as Prisma.TransactionClient
  await reserveLoginAlias(tx, 'owner', 'Old.Name')
  await assert.rejects(reserveLoginAlias(tx, 'other', 'Old.Name'))
  assert.equal(writes, 0)
})
