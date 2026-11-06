import assert from 'node:assert/strict'
import test from 'node:test'
import { ensureStudentPlayer } from './student-player'
import type { Prisma } from '../generated/prisma/client'

function fixture(overrides: Record<string, unknown> = {}) {
  const user = {
    id: 'user',
    playerProfileId: null,
    studentRecordId: 'student',
    verificationLevel: 'STUDENT_VERIFIED',
    ...overrides,
  }
  const player = { id: 'player', organizationId: 'org', studentRecordId: 'student' }
  const writes: Array<{ kind: string; data: unknown }> = []
  const tx = {
    $queryRawUnsafe: async () => {
      writes.push({ kind: 'lock', data: null })
    },
    user: {
      findFirst: async ({ where }: { where: { id?: unknown } }) =>
        typeof where.id === 'string' ? user : null,
      update: async ({ data }: { data: unknown }) => {
        writes.push({ kind: 'bind', data })
      },
    },
    studentRecord: {
      findFirst: async () => ({
        id: 'student',
        realName: '学生',
        studentNumber: null,
        academicYear: null,
      }),
    },
    playerProfile: {
      findFirst: async () => player,
      upsert: async () => {
        writes.push({ kind: 'upsert', data: null })
        return player
      },
    },
    auditLog: {
      create: async ({ data }: { data: unknown }) => {
        writes.push({ kind: 'audit', data })
      },
    },
  }
  return { tx, player, writes, user }
}
const approve = (tx: unknown, bind = true) =>
  ensureStudentPlayer(tx as Prisma.TransactionClient, 'org', 'user', 'reviewer', 'request', bind)

test('approval reuses a stable student profile, preserves staff verification, and can prepare without binding', async () => {
  const current = fixture({ verificationLevel: 'STAFF_VERIFIED' })
  assert.equal((await approve(current.tx)).id, 'player')
  assert.deepEqual(
    current.writes.map((w) => w.kind),
    ['lock', 'upsert', 'bind', 'audit'],
  )
  assert.deepEqual(current.writes.find((w) => w.kind === 'bind')?.data, {
    playerProfileId: 'player',
  })
  const prepared = fixture()
  await approve(prepared.tx, false)
  assert.ok(!prepared.writes.some((w) => w.kind === 'bind'))
  assert.ok(prepared.writes.some((w) => w.kind === 'audit'))
})

test('approval refuses missing student identity and never falls back to a matching name', async () => {
  const current = fixture({ studentRecordId: null })
  await assert.rejects(approve(current.tx), /学生档案/)
  assert.deepEqual(
    current.writes.map((w) => w.kind),
    ['lock'],
  )
})

test('approval refuses cross-organization, conflicting student and already claimed player profiles', async () => {
  for (const mode of ['organization', 'student', 'claimed'] as const) {
    const current = fixture({ playerProfileId: 'player' })
    if (mode === 'organization') current.player.organizationId = 'other-org'
    if (mode === 'student') current.player.studentRecordId = 'other-student'
    if (mode === 'claimed') {
      const original = current.tx.user.findFirst
      current.tx.user.findFirst = async (options) =>
        typeof options.where.id === 'string'
          ? original(options)
          : { ...current.user, id: 'another-user' }
    }
    await assert.rejects(approve(current.tx), /不一致|其他账号/)
    assert.ok(!current.writes.some((w) => w.kind === 'bind' || w.kind === 'audit'))
  }
})
