import { parseArgs } from 'node:util'
import { isUUID } from 'class-validator'
import { PrismaClient, Prisma } from '../generated/prisma/client'
import { allocateUsername, renameUsername, reserveLoginAlias, usernameStem } from './usernames'

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean' },
      help: { type: 'boolean' },
      'organization-id': { type: 'string' },
    },
  })
  if (values.help) {
    console.log('node dist/auth/migrate-usernames.cli.js [--apply] [--organization-id UUID]')
    console.log(
      '默认只读汇总；--apply 原位更名并保留旧登录别名。需先备份和应用用户名别名迁移。无实名账号保持原用户名。',
    )
    return
  }
  const organizationId = values['organization-id']
  if (organizationId && !isUUID(organizationId)) throw new Error('organization-id必须为组织UUID')
  const prisma = new PrismaClient()
  try {
    const users = await prisma.user.findMany({
      ...(organizationId ? { where: { memberships: { some: { organizationId } } } } : {}),
      select: {
        id: true,
        realName: true,
        loginNameNormalized: true,
        memberships: { select: { organizationId: true }, take: 1, orderBy: { joinedAt: 'asc' } },
      },
      orderBy: { id: 'asc' },
    })
    const pending = users.filter(
      (user) => !user.realName?.trim() || !usernameStem(user.realName) || !user.memberships.length,
    )
    const candidates = users.filter((user) => {
      const stem = user.realName?.trim() ? usernameStem(user.realName) : ''
      return (
        stem &&
        user.memberships.length &&
        !new RegExp(`^${stem}\\d{3}$`).test(user.loginNameNormalized || '')
      )
    })
    if (!values.apply) {
      console.log(
        JSON.stringify({
          mode: 'dry-run',
          users: users.length,
          toRename: candidates.length,
          missingRealName: pending.length,
          pendingUserIds: pending.map((user) => user.id),
        }),
      )
      return
    }
    let renamed = 0
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('username-migration-0.9.0',0))`
        for (const user of users)
          if (user.loginNameNormalized)
            await reserveLoginAlias(tx, user.id, user.loginNameNormalized)
        for (const original of candidates) {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM app_users WHERE id=${original.id}::uuid FOR UPDATE`,
          )
          const user = await tx.user.findUniqueOrThrow({
            where: { id: original.id },
            select: { id: true, realName: true, loginNameNormalized: true },
          })
          if (
            user.realName !== original.realName ||
            user.loginNameNormalized !== original.loginNameNormalized
          )
            throw new Error('迁移期间账号资料变化，请重新运行只读检查')
          const next = await allocateUsername(tx, user.realName!)
          await renameUsername(tx, user, next)
          await tx.auditLog.create({
            data: {
              organizationId: original.memberships[0]!.organizationId,
              actorType: 'SYSTEM',
              action: 'USERNAME_MIGRATED',
              targetType: 'User',
              targetId: user.id,
              reason: '0.9.0 用户名改为实名拼音加三位编号，保留旧登录别名',
              source: 'CLI',
              requestId: 'username-migration-0.9.0',
            },
          })
          renamed++
        }
      },
      { isolationLevel: 'Serializable', timeout: 120000 },
    )
    console.log(
      JSON.stringify({
        mode: 'applied',
        renamed,
        missingRealName: pending.length,
        pendingUserIds: pending.map((user) => user.id),
      }),
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.constructor === Error
      ? error.message
      : '用户名迁移失败；请检查迁移、唯一性和数据库状态，事务已回滚',
  )
  process.exitCode = 1
})
