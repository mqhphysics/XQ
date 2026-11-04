import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Prisma } from '../generated/prisma/client'
import { assertCaptainCapacity, CAPTAIN_LIMIT_MESSAGE, MAX_TEAM_CAPTAINS } from './captain-limit'

function fakeTx(otherCaptains: number) {
  const calls: unknown[] = []
  const tx = {
    $executeRaw: async () => 1,
    roleAssignment: {
      count: async (args: unknown) => {
        calls.push(args)
        return otherCaptains
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, calls }
}

test('a team accepts a first and second captain', async () => {
  for (const others of [0, 1]) {
    const { tx, calls } = fakeTx(others)
    await assertCaptainCapacity(tx, 'org', 'team', 'user')
    assert.deepEqual((calls[0] as { where: { userId: unknown } }).where.userId, { not: 'user' })
  }
  assert.equal(MAX_TEAM_CAPTAINS, 2)
})

test('a third captain is rejected with 409 and a clear message', async () => {
  const { tx } = fakeTx(2)
  await assert.rejects(assertCaptainCapacity(tx, 'org', 'team', 'third'), (error: unknown) => {
    const e = error as { getStatus(): number; getResponse(): { message: string } }
    assert.equal(e.getStatus(), 409)
    assert.equal(e.getResponse().message, CAPTAIN_LIMIT_MESSAGE)
    return true
  })
})
