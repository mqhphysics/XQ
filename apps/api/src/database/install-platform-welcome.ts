import { AuditActorType, PostStatus, PrismaClient } from '../generated/prisma/client'
import {
  DEMO_ORGANIZATION_ID,
  DEMO_POSTS,
  PLATFORM_WELCOME_POST_KEY,
  fixtureId,
} from './demo-fixture'

/**
 * Adds (or refreshes) the platform-wide 「欢迎来到晓球」 notice without resetting other data.
 * It is the earliest platform notice, so it is listed last in 官方公告.
 */
export async function installPlatformWelcome(prisma: PrismaClient): Promise<boolean> {
  const definition = DEMO_POSTS.find((post) => post.key === PLATFORM_WELCOME_POST_KEY)
  if (!definition) throw new Error('缺少平台欢迎公告定义')
  return prisma.$transaction(async (tx) => {
    const admin = await tx.user.findFirst({
      where: {
        id: fixtureId('user:admin'),
        memberships: { some: { organizationId: DEMO_ORGANIZATION_ID, status: 'ACTIVE' } },
      },
      select: { id: true },
    })
    const postId = fixtureId(`post:${definition.key}`)
    const exists = await tx.post.findUnique({
      where: { id: postId },
      select: { organizationId: true },
    })
    if (exists && exists.organizationId !== DEMO_ORGANIZATION_ID)
      throw new Error('欢迎公告 ID 与其他组织记录冲突')
    const data = {
      organizationId: DEMO_ORGANIZATION_ID,
      tournamentId: null,
      authorUserId: admin?.id ?? null,
      teamId: null,
      type: definition.type,
      publicationSource: 'SYSTEM',
      status: PostStatus.PUBLISHED,
      title: definition.title ?? null,
      body: definition.body,
      imageUrl: null,
      publishedAt: new Date(definition.publishedAt),
    }
    await tx.post.upsert({
      where: { id: postId },
      create: { id: postId, ...data, createdAt: new Date(definition.publishedAt) },
      update: data,
    })
    if (!exists)
      await tx.auditLog.create({
        data: {
          organizationId: DEMO_ORGANIZATION_ID,
          actorType: AuditActorType.SYSTEM,
          actorRoleSnapshot: [],
          action: 'PLATFORM_WELCOME_NOTICE_INSTALLED',
          targetType: 'Post',
          targetId: postId,
          afterSummary: { title: definition.title ?? null },
          reason: '与首次访问欢迎弹窗同步的平台公告，排在官方公告最后',
          requestId: 'platform-welcome-2026-10-18',
          source: 'LOCAL_DEMO',
        },
      })
    return !exists
  })
}

if (require.main === module) {
  const prisma = new PrismaClient()
  void installPlatformWelcome(prisma)
    .then((added) => console.log(`Platform welcome notice ${added ? 'added' : 'refreshed'}.`))
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
