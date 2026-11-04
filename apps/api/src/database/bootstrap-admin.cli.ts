import { parseArgs } from 'node:util'

import { PrismaClient } from '../generated/prisma/client'
import { bootstrapAdmin } from './bootstrap-admin'

async function main() {
  const { values } = parseArgs({
    options: {
      'organization-code': { type: 'string' },
      'organization-name': { type: 'string' },
      username: { type: 'string' },
      'display-name': { type: 'string' },
      help: { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log(
      'db:bootstrap-admin --organization-code CODE --organization-name NAME --username USER --display-name NAME',
    )
    console.log(
      '须先应用迁移，并通过 DATABASE_URL 与 BOOTSTRAP_ADMIN_PASSWORD 环境变量提供连接及初始化密码。',
    )
    console.log(
      '只初始化组织管理员，不创建演示数据；已有管理员或同名账号时拒绝运行。密码不会写入日志。',
    )
    return
  }
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD
  if (
    !password ||
    !values['organization-code'] ||
    !values['organization-name'] ||
    !values.username ||
    !values['display-name']
  ) {
    throw new Error('参数不全；运行 db:bootstrap-admin --help 查看用法')
  }
  const prisma = new PrismaClient()
  try {
    const result = await bootstrapAdmin(prisma, {
      organizationCode: values['organization-code'],
      organizationName: values['organization-name'],
      username: values.username,
      displayName: values['display-name'],
      password,
    })
    console.log(JSON.stringify(result))
    console.log(
      '初始化完成。将 organizationId 配置为 API DEFAULT_ORGANIZATION_ID 和管理员前端 VITE_ORGANIZATION_ID。',
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  // Prisma errors may contain database metadata; only emit our own validation messages.
  console.error(
    error instanceof Error && error.constructor === Error
      ? error.message
      : '初始化失败；请检查迁移、数据库连接和并发初始化状态',
  )
  process.exitCode = 1
})
