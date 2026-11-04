import { AuditActorType, PostStatus, PrismaClient } from '../generated/prisma/client'
import { DEMO_ORGANIZATION_ID, DEMO_POSTS, fixtureId, isPlatformDemoPost } from './demo-fixture'

/** Adds only the five explicitly requested photo examples; existing posts and interactions stay intact. */
export async function installCampusPhotoExamples(prisma: PrismaClient): Promise<number> {
  const definitions = DEMO_POSTS.filter((post) => post.key.startsWith('photo-'))
  return prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findFirst({
      where: { organizationId: DEMO_ORGANIZATION_ID, tournamentCode: 'DEMO-GREEN-CUP-2026' },
      select: { id: true },
    })
    if (!tournament) throw new Error('演示赛事不存在；本脚本不会重新初始化数据库')
    const usernames = ['admin', 'captain', 'player', 'student']
    const users = await tx.user.findMany({
      where: {
        id: { in: usernames.map((name) => fixtureId(`user:${name}`)) },
        memberships: { some: { organizationId: DEMO_ORGANIZATION_ID, status: 'ACTIVE' } },
      },
      select: { id: true, loginNameNormalized: true },
    })
    const authors = new Map(users.map((user) => [user.loginNameNormalized, user.id]))
    let inserted = 0
    for (const definition of definitions) {
      const authorUserId = authors.get(definition.authorUsername ?? 'admin')
      if (!authorUserId) throw new Error(`缺少演示账户：${definition.authorUsername ?? 'admin'}`)
      const postId = fixtureId(`post:${definition.key}`)
      const exists = await tx.post.findUnique({
        where: { id: postId },
        select: { organizationId: true },
      })
      if (exists && exists.organizationId !== DEMO_ORGANIZATION_ID)
        throw new Error('照片示例 ID 与其他组织记录冲突')
      const data = {
        organizationId: DEMO_ORGANIZATION_ID,
        tournamentId: isPlatformDemoPost(definition) ? null : tournament.id,
        authorUserId,
        type: definition.type,
        status: PostStatus.PUBLISHED,
        title: definition.title ?? null,
        body: definition.body,
        imageUrl: definition.imageUrl ?? null,
        publishedAt: new Date(definition.publishedAt),
      }
      await tx.post.upsert({ where: { id: postId }, create: { id: postId, ...data }, update: data })
      if (!exists) inserted += 1
    }
    await tx.auditLog.create({
      data: {
        organizationId: DEMO_ORGANIZATION_ID,
        actorType: AuditActorType.SYSTEM,
        actorRoleSnapshot: [],
        action: 'DEMO_CAMPUS_PHOTO_EXAMPLES_INSTALLED',
        targetType: 'Tournament',
        targetId: tournament.id,
        afterSummary: { photoExampleCount: definitions.length, inserted },
        reason: '用户授权将六张校园足球照片用于首页与图文发布示例',
        requestId: 'campus-photos-2026-10-01',
        source: 'LOCAL_DEMO',
      },
    })
    return inserted
  })
}

if (require.main === module) {
  const prisma = new PrismaClient()
  void installCampusPhotoExamples(prisma)
    .then((count) =>
      console.log(
        `Photo examples ready: ${count} added; only five named demo photo posts were updated.`,
      ),
    )
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
