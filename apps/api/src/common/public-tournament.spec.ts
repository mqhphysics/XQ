import assert from 'node:assert/strict'
import test from 'node:test'
import type { PrismaService } from '../database/prisma.service'
import { selectPublicTournament } from './public-tournament'

test('empty deployment default selects newest tournament but explicit empty selection is rejected', async () => {
  const previous = process.env.DEFAULT_TOURNAMENT_ID
  process.env.DEFAULT_TOURNAMENT_ID = '  '
  let called = 0
  const prisma = {
    tournament: {
      findFirst: async ({ where }: { where: { id?: string } }) => {
        called++
        assert.equal(where.id, undefined)
        return { id: '00000000-0000-4000-8000-000000000001' }
      },
    },
  } as unknown as Pick<PrismaService, 'tournament'>
  try {
    assert.equal(
      (await selectPublicTournament(prisma, 'organization')).id,
      '00000000-0000-4000-8000-000000000001',
    )
    await assert.rejects(selectPublicTournament(prisma, 'organization', ''), /赛事选择/)
    assert.equal(called, 1)
  } finally {
    if (previous === undefined) delete process.env.DEFAULT_TOURNAMENT_ID
    else process.env.DEFAULT_TOURNAMENT_ID = previous
  }
})
