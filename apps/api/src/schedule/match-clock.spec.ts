import assert from 'node:assert/strict'
import test from 'node:test'
import type { PrismaService } from '../database/prisma.service'
import { MatchClockService } from './match-clock.service'
import type { AuthService } from '../auth/auth.service'

test('scheduled starts and ends change status only, including missed earlier days and absent scores', async () => {
  const updates: unknown[] = []
  const prisma = {
    match: {
      findMany: async (args: unknown) => {
        assert.deepEqual((args as { where: { status: unknown } }).where.status, {
          in: ['SCHEDULED', 'LIVE'],
        })
        return [
          {
            id: 'start',
            organizationId: 'org',
            actualStartedAt: null,
            actualEndedAt: null,
            tournamentId: 'men',
            status: 'SCHEDULED',
            scheduledStartAt: new Date('2026-10-25T06:00Z'),
          },
          {
            id: 'end',
            organizationId: 'org',
            actualStartedAt: null,
            actualEndedAt: null,
            tournamentId: 'men',
            status: 'LIVE',
            scheduledStartAt: new Date('2026-10-25T04:00Z'),
          },
          {
            id: 'missed',
            organizationId: 'org',
            actualStartedAt: null,
            actualEndedAt: null,
            tournamentId: 'women',
            status: 'SCHEDULED',
            scheduledStartAt: new Date('2026-10-24T04:00Z'),
          },
        ]
      },
      updateMany: async (args: unknown) => {
        updates.push(args)
        return { count: 1 }
      },
    },
    competitionRuleVersion: {
      findFirst: async ({ where }: { where: { tournamentId: string } }) => ({
        rules: { match: { periodMinutes: where.tournamentId === 'men' ? 30 : 20 } },
      }),
    },
  }
  await new MatchClockService(prisma as unknown as PrismaService, {} as AuthService).tick(
    new Date('2026-10-25T06:20Z'),
  )
  assert.deepEqual(updates, [
    {
      where: {
        id: 'start',
        status: 'SCHEDULED',
        actualStartedAt: null,
        actualEndedAt: null,
        scheduledStartAt: new Date('2026-10-25T06:00Z'),
      },
      data: { status: 'LIVE' },
    },
    {
      where: {
        id: 'end',
        status: 'LIVE',
        actualStartedAt: null,
        actualEndedAt: null,
        scheduledStartAt: new Date('2026-10-25T04:00Z'),
      },
      data: { status: 'FINISHED' },
    },
    {
      where: {
        id: 'missed',
        status: 'SCHEDULED',
        actualStartedAt: null,
        actualEndedAt: null,
        scheduledStartAt: new Date('2026-10-24T04:00Z'),
      },
      data: { status: 'FINISHED' },
    },
  ])
  assert(!JSON.stringify(updates).includes('Score'))
})
