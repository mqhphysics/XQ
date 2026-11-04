import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { MatchCheckinService } from './match-checkin.service'
import { ApiHttpException } from '../common/api-http.exception'
import type { PrismaService } from '../database/prisma.service'
import type { AuthService } from '../auth/auth.service'

const organizationId = '00000000-0000-4000-8000-000000000091'
const matchId = '00000000-0000-4000-8000-000000000092'
const tournamentId = '00000000-0000-4000-8000-000000000093'

/** Controlled service fixture; PostgreSQL constraint/migration execution is a separate check. */
function fixture() {
  const rows = new Map<string, { userId: string; createdAt: Date }>()
  const prisma = {
    match: {
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        where.id === matchId && where.organizationId === organizationId
          ? { id: matchId, tournamentId }
          : null,
    },
    tournament: {
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        where.id === tournamentId && where.organizationId === organizationId
          ? { id: tournamentId }
          : null,
    },
    matchCheckin: {
      createMany: async ({ data }: { data: Array<{ userId: string }> }) => {
        let count = 0
        for (const row of data)
          if (!rows.has(row.userId)) {
            rows.set(row.userId, { userId: row.userId, createdAt: new Date() })
            count++
          }
        return { count }
      },
      count: async () => rows.size,
      findUnique: async ({ where }: { where: { matchId_userId: { userId: string } } }) =>
        rows.get(where.matchId_userId.userId) ?? null,
    },
    $transaction: async <T>(run: (tx: unknown) => Promise<T>) => run(prisma),
  }
  const session = (token?: string) => (token ? { userId: token, organizationId } : null)
  const auth = {
    getSession: async (token?: string) => session(token),
    requireSession: async (token?: string) => {
      if (!token)
        throw new ApiHttpException(HttpStatus.UNAUTHORIZED, {
          code: ERROR_CODES.UNAUTHORIZED,
          message: '请先登录',
        })
      return session(token)
    },
  }
  return {
    rows,
    service: new MatchCheckinService(
      prisma as unknown as PrismaService,
      auth as unknown as AuthService,
    ),
  }
}

test('check-in survives a subsequent service read and retries count a viewer once', async () => {
  const { service } = fixture()
  assert.deepEqual(await service.get(organizationId, matchId), {
    matchId,
    count: 0,
    checkedIn: false,
    checkedInAt: null,
  })
  const first = await service.checkIn('user-a', matchId)
  const second = await service.checkIn('user-a', matchId)
  assert.equal(first.count, 1)
  assert.equal(second.count, 1)
  assert.equal(second.checkedInAt, first.checkedInAt)
  assert.equal((await service.get(organizationId, matchId, 'user-a')).checkedIn, true)
  assert.equal((await service.get(organizationId, matchId, 'user-b')).checkedIn, false)
})

test('parallel retries and another viewer preserve distinct, idempotent attendance', async () => {
  const { service, rows } = fixture()
  await Promise.all(Array.from({ length: 12 }, () => service.checkIn('user-a', matchId)))
  await service.checkIn('user-b', matchId)
  assert.equal(rows.size, 2)
  assert.equal((await service.get(organizationId, matchId)).count, 2)
})

test('anonymous writes, foreign organizations and unknown matches cannot create attendance', async () => {
  const { service, rows } = fixture()
  await assert.rejects(
    service.checkIn(undefined, matchId),
    (error: unknown) => error instanceof ApiHttpException && error.getStatus() === 401,
  )
  await assert.rejects(
    service.get('other-organization', matchId, 'user-a'),
    (error: unknown) => error instanceof ApiHttpException && error.getStatus() === 403,
  )
  await assert.rejects(
    service.checkIn('user-a', '00000000-0000-4000-8000-000000000099'),
    (error: unknown) => error instanceof ApiHttpException && error.getStatus() === 404,
  )
  assert.equal(rows.size, 0)
})
