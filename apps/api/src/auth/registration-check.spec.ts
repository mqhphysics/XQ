import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { Prisma } from '../generated/prisma/client'
import { registrationCheck } from './registration-check'
import { RegisterDto } from './auth.dto'

const rows = [
  { id: 'a', realName: '学生甲', studentNumber: '2099990001', user: null },
  { id: 'b', realName: '学生乙', studentNumber: '2099990002', user: null },
  { id: 'c', realName: '仅有姓名', studentNumber: null, user: null },
]
function directory(registered = false) {
  return {
    studentRecord: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string
          status: string
          OR: Array<{ realName?: string; studentNumber?: string }>
        }
      }) => {
        assert.equal(where.organizationId, 'org')
        assert.equal(where.status, 'ACTIVE')
        return rows.filter((row) =>
          where.OR.some(
            (item) =>
              item.realName === row.realName ||
              Boolean(item.studentNumber && item.studentNumber === row.studentNumber),
          ),
        )
      },
    },
    user: { findFirst: async () => (registered ? { id: 'registered' } : null) },
  } as unknown as Prisma.TransactionClient
}
test('preflight matches a known number and rejects a wrong name without returning directory records', async () => {
  assert.equal(
    (await registrationCheck(directory(), 'org', '学生甲', '2099990001')).reason,
    'MATCHED',
  )
  const mismatch = await registrationCheck(directory(), 'org', '学生甲', '2099990002')
  assert.equal(mismatch.eligible, false)
  assert.equal(mismatch.reason, 'NAME_NUMBER_MISMATCH')
  assert.deepEqual(Object.keys(mismatch).sort(), ['eligible', 'message', 'reason'])
  assert.equal(
    (await registrationCheck(directory(), 'org', '未收录姓名', '2099990009')).reason,
    'NAME_NOT_LISTED',
  )
})
test('a listed name without a stored number still permits manual review and duplicate accounts are explained', async () => {
  assert.equal(
    (await registrationCheck(directory(), 'org', '仅有姓名', '2099990009')).reason,
    'NUMBER_PENDING',
  )
  assert.equal(
    (await registrationCheck(directory(true), 'org', '学生甲', '2099990001')).reason,
    'ALREADY_REGISTERED',
  )
})
test('simple registration needs one name only and legacy Chinese login names remain accepted', async () => {
  const input = { realName: '学生甲', studentId: '2099990001', password: '123456' }
  assert.equal((await validate(plainToInstance(RegisterDto, input))).length, 0)
  assert.equal(
    (
      await validate(
        plainToInstance(RegisterDto, { ...input, username: '学生甲', displayName: '学生甲' }),
      )
    ).length,
    0,
  )
  assert(
    (await validate(plainToInstance(RegisterDto, { ...input, email: 'wrong' }))).some(
      (error) => error.property === 'email',
    ),
  )
})
