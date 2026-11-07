import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { PrismaClient } from '../generated/prisma/client'
import { AuthService } from './auth.service'
import type { PrismaService } from '../database/prisma.service'
import { hashPassword } from './password'
import { usernameStem } from './usernames'

test(
  'username migration dry-run, atomic apply and repeat preserve old login, stable IDs, roles and sessions',
  { timeout: 90000 },
  async () => {
    const url = process.env.TEST_DATABASE_URL
    assert(url, 'An isolated TEST_DATABASE_URL is required')
    assert.match(new URL(url).pathname, /_test_/)
    if (process.env.DATABASE_URL)
      assert.notEqual(new URL(url).pathname, new URL(process.env.DATABASE_URL).pathname)
    const db = new PrismaClient({ datasources: { db: { url } } })
    const suffix = randomUUID(),
      password = 'FICTIONAL-Migration-090!',
      credential = hashPassword(password)
    const organization = await db.organization.create({
      data: { slug: 'username-migration-' + suffix, name: 'FICTIONAL_TEST 用户名迁移' },
    })
    try {
      const student = await db.studentRecord.create({
        data: { organizationId: organization.id, realName: '同名验收' },
      })
      const player = await db.playerProfile.create({
        data: {
          organizationId: organization.id,
          displayName: '保留球员展示名',
          studentRecordId: student.id,
        },
      })
      const users = await Promise.all(
        [0, 1, 2].map((index) =>
          db.user.create({
            data: {
              loginNameNormalized: `legacy-${suffix}-${index}`,
              displayName: '保留昵称' + index,
              realName: index < 2 ? '同名验收' : null,
              ...(index === 0
                ? {
                    studentRecordId: student.id,
                    playerProfileId: player.id,
                    verificationLevel: 'PLAYER_CONFIRMED' as const,
                  }
                : {}),
              memberships: { create: { organizationId: organization.id, status: 'ACTIVE' } },
              passwordCredential: {
                create: {
                  passwordHash: credential.hash,
                  passwordSalt: credential.salt,
                  algorithm: credential.algorithm,
                },
              },
            },
          }),
        ),
      )
      await db.roleAssignment.create({
        data: {
          organizationId: organization.id,
          userId: users[0]!.id,
          role: 'ORGANIZATION_ADMIN',
          scopeType: 'ORGANIZATION',
          scopeId: organization.id,
          grantedByUserId: users[0]!.id,
        },
      })
      const auth = new AuthService(db as PrismaService)
      const session = await auth.login(
        users[0]!.loginNameNormalized!,
        password,
        organization.id,
        {},
      )
      const userIds = users.map((user) => user.id)
      const snapshot = async () => ({
        users: await db.user.findMany({
          where: { id: { in: userIds } },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            displayName: true,
            realName: true,
            realNameNormalized: true,
            studentId: true,
            studentRecordId: true,
            playerProfileId: true,
            verificationLevel: true,
            status: true,
            avatarUrl: true,
            coverUrl: true,
            bio: true,
          },
        }),
        players: await db.playerProfile.findMany({
          where: { id: player.id },
          select: { id: true, studentRecordId: true, displayName: true, avatarUrl: true },
        }),
        students: await db.studentRecord.findMany({
          where: { id: student.id },
          select: { id: true, realName: true, studentNumber: true, version: true },
        }),
        memberships: await db.organizationMembership.findMany({
          where: { userId: { in: userIds } },
          orderBy: { id: 'asc' },
        }),
        roles: await db.roleAssignment.findMany({
          where: { userId: { in: userIds } },
          orderBy: { id: 'asc' },
        }),
        sessions: await db.userSession.findMany({
          where: { userId: { in: userIds } },
          orderBy: { id: 'asc' },
        }),
        credentials: await db.passwordCredential.findMany({
          where: { userId: { in: userIds } },
          orderBy: { userId: 'asc' },
        }),
      })
      const before = await snapshot()
      const run = (apply = false) =>
        JSON.parse(
          execFileSync(
            process.execPath,
            [
              join(__dirname, 'migrate-usernames.cli.js'),
              '--organization-id',
              organization.id,
              ...(apply ? ['--apply'] : []),
            ],
            {
              env: { ...process.env, DATABASE_URL: url },
              encoding: 'utf8',
              timeout: 60000,
            },
          ).trim(),
        ) as {
          toRename?: number
          renamed?: number
          missingRealName: number
          pendingUserIds: string[]
        }
      const preview = run()
      assert.equal(preview.toRename, 2)
      assert.equal(preview.missingRealName, 1)
      assert.deepEqual(preview.pendingUserIds, [users[2]!.id])
      assert.deepEqual(await snapshot(), before)
      const first = run(true)
      assert.equal(first.renamed, 2)
      assert.deepEqual(await snapshot(), before)
      const renamed = await db.user.findMany({
        where: { id: { in: userIds } },
        orderBy: { id: 'asc' },
      })
      const assigned = renamed
        .filter((user) => user.realName)
        .map((user) => user.loginNameNormalized!)
      assert.equal(new Set(assigned).size, 2)
      for (const username of assigned)
        assert.match(username, new RegExp('^' + usernameStem('同名验收') + '\\d{3}$'))
      assert.equal(
        renamed.find((user) => user.id === users[2]!.id)!.loginNameNormalized,
        users[2]!.loginNameNormalized,
      )
      assert.equal(run(true).renamed, 0)
      assert.equal(run().toRename, 0)
      assert.deepEqual(await snapshot(), before)
      for (const user of users) {
        assert.equal(
          (
            await db.userLoginAlias.findUniqueOrThrow({
              where: { aliasNormalized: user.loginNameNormalized! },
            })
          ).userId,
          user.id,
        )
        assert.equal(
          (await auth.login(user.loginNameNormalized!, password, organization.id, {})).user.id,
          user.id,
        )
      }
      const existing = await auth.requireSession('Bearer ' + session.accessToken)
      assert.equal(existing.userId, users[0]!.id)
      assert.equal(existing.user.linkedPlayer?.id, player.id)
      assert(existing.user.roles.some((role) => role.role === 'ORGANIZATION_ADMIN'))
    } finally {
      await db.$disconnect()
    }
  },
)
