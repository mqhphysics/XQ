import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { PrismaClient } from '../generated/prisma/client'
import { seedCampusDirectory } from './seed-campus-directory'

async function main() {
  const databaseUrl = process.env.DATABASE_URL,
    organizationId = process.env.CAMPUS_DEMO_ORGANIZATION_ID
  if (!databaseUrl || !organizationId) throw new Error('需要显式指定隔离数据库与演示组织')
  const prisma = new PrismaClient()
  try {
    const result = await seedCampusDirectory(prisma, organizationId, {
      databaseUrl,
      avatarDirectory: resolve(__dirname, '../../../../private-data/media/avatars'),
    })
    const output = resolve(__dirname, '../../../../private-data/campus-demo/accounts.json')
    await mkdir(dirname(output), { recursive: true })
    if (result.created)
      await writeFile(output, JSON.stringify(result.accounts, null, 2), { mode: 0o600 })
    console.log(
      JSON.stringify({
        students: result.students,
        players: result.players,
        demoAccounts: result.users,
        created: result.created,
        credentialsPrinted: false,
      }),
    )
  } finally {
    await prisma.$disconnect()
  }
}
if (require.main === module)
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : '演示目录生成失败')
    process.exitCode = 1
  })
