import { randomUUID } from 'node:crypto'

import { hashPassword } from '../auth/password'
import type { PrismaClient } from '../generated/prisma/client'

export interface BootstrapAdminInput {
  organizationCode: string
  organizationName: string
  username: string
  displayName: string
  password: string
}

/** Provision the first organization administrator, never reset an existing account. */
export async function bootstrapAdmin(prisma: PrismaClient, input: BootstrapAdminInput) {
  const organizationCode = input.organizationCode.trim().toLowerCase()
  const username = input.username.trim().toLowerCase()
  const organizationName = input.organizationName.trim()
  const displayName = input.displayName.trim()
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(organizationCode)) {
    throw new Error('组织 code 须为 2–64 位小写字母、数字或连字符')
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(username)) {
    throw new Error('用户名须为 3–120 位字母、数字、点、下划线或连字符')
  }
  if (
    !organizationName ||
    organizationName.length > 120 ||
    !displayName ||
    displayName.length > 120
  ) {
    throw new Error('组织名和显示名须为 1–120 个字符')
  }
  if (input.password.length < 12 || input.password.length > 128 || /\s/.test(input.password)) {
    throw new Error('初始化密码须为 12–128 位且不含空白；通过 BOOTSTRAP_ADMIN_PASSWORD 提供')
  }
  const digest = hashPassword(input.password)
  return prisma.$transaction(
    async (tx) => {
      // Serialize simultaneous bootstrap attempts without changing database permissions.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(72361004)::text`
      const existing = await tx.organization.findUnique({ where: { slug: organizationCode } })
      if (existing && existing.status !== 'ACTIVE') throw new Error('组织不可用，拒绝初始化')
      if (existing) {
        const admin = await tx.roleAssignment.findFirst({
          where: {
            organizationId: existing.id,
            revokedAt: null,
            role: { in: ['ORGANIZATION_ADMIN', 'PLATFORM_ADMIN'] },
          },
        })
        if (admin) throw new Error('该组织已有管理员；此命令不能添加、替换或重置管理员')
      }
      if (await tx.user.findFirst({ where: { loginNameNormalized: username } })) {
        throw new Error('用户名已存在；拒绝修改已有账号或密码')
      }
      const organization =
        existing ??
        (await tx.organization.create({ data: { slug: organizationCode, name: organizationName } }))
      const user = await tx.user.create({
        data: {
          loginNameNormalized: username,
          displayName,
          verificationLevel: 'STAFF_VERIFIED',
          passwordCredential: {
            create: {
              passwordHash: digest.hash,
              passwordSalt: digest.salt,
              algorithm: digest.algorithm,
            },
          },
          memberships: {
            create: { organizationId: organization.id, status: 'ACTIVE', joinedAt: new Date() },
          },
          roleAssignments: {
            create: {
              organizationId: organization.id,
              role: 'ORGANIZATION_ADMIN',
              scopeType: 'ORGANIZATION',
              scopeId: organization.id,
            },
          },
        },
      })
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorType: 'SYSTEM',
          action: 'BOOTSTRAP_ORGANIZATION_ADMIN',
          targetType: 'User',
          targetId: user.id,
          afterSummary: { username, role: 'ORGANIZATION_ADMIN', organizationId: organization.id },
          reason: '首次离线初始化组织管理员',
          requestId: `bootstrap-${randomUUID()}`,
          source: 'BOOTSTRAP_CLI',
        },
      })
      return { organizationId: organization.id, userId: user.id, username }
    },
    { isolationLevel: 'Serializable' },
  )
}
