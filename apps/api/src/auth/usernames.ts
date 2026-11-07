import { randomInt } from 'node:crypto'
import { pinyin } from 'pinyin-pro'
import type { Prisma } from '../generated/prisma/client'
import { centerError } from '../admin-center/admin-center.policy'

export function usernameStem(realName: string): string {
  return pinyin(realName.normalize('NFKC').trim(), {
    toneType: 'none',
    surname: 'head',
    type: 'array',
    v: true,
  })
    .join('')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 117)
}

export function threeDigitUsername(
  stem: string,
  taken: ReadonlySet<string>,
  start = randomInt(1000),
) {
  for (let index = 0; index < 1000; index++) {
    const candidate = `${stem}${String((start + index) % 1000).padStart(3, '0')}`
    if (!taken.has(candidate)) return candidate
  }
  throw centerError(409, '同名账号的三位编号已用完，请联系管理员处理')
}

export async function allocateUsername(
  tx: Prisma.TransactionClient,
  realName: string,
): Promise<string> {
  const stem = usernameStem(realName)
  if (!stem) throw centerError(400, '姓名暂不能生成用户名，请联系管理员核对姓名')
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'username:' + stem},0))`
  const [users, aliases] = await Promise.all([
    tx.user.findMany({
      where: { loginNameNormalized: { startsWith: stem } },
      select: { loginNameNormalized: true },
    }),
    tx.userLoginAlias.findMany({
      where: { aliasNormalized: { startsWith: stem } },
      select: { aliasNormalized: true },
    }),
  ])
  return threeDigitUsername(
    stem,
    new Set([
      ...users.map((user) => user.loginNameNormalized!).filter(Boolean),
      ...aliases.map((alias) => alias.aliasNormalized),
    ]),
  )
}

/** Old and current usernames share one namespace; a past login may never move to another user. */
export async function reserveLoginAlias(tx: Prisma.TransactionClient, userId: string, raw: string) {
  const aliasNormalized = raw.normalize('NFKC').trim().toLowerCase()
  if (!aliasNormalized) return
  const [alias, current] = await Promise.all([
    tx.userLoginAlias.findUnique({ where: { aliasNormalized } }),
    tx.user.findFirst({
      where: { loginNameNormalized: aliasNormalized, id: { not: userId } },
      select: { id: true },
    }),
  ])
  if (current || (alias && alias.userId !== userId)) throw centerError(409, '用户名已被使用')
  if (!alias) await tx.userLoginAlias.create({ data: { aliasNormalized, userId } })
}

export async function renameUsername(
  tx: Prisma.TransactionClient,
  user: { id: string; loginNameNormalized: string | null },
  next: string,
) {
  if (user.loginNameNormalized) await reserveLoginAlias(tx, user.id, user.loginNameNormalized)
  await reserveLoginAlias(tx, user.id, next)
  await tx.user.update({ where: { id: user.id }, data: { loginNameNormalized: next } })
}
