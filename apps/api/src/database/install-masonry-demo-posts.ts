import { AuditActorType, PostStatus, PrismaClient } from '../generated/prisma/client'
import {
  DEMO_ORGANIZATION_ID,
  DEMO_POSTS,
  DEMO_TEAMS,
  fixtureId,
  isPlatformDemoPost,
} from './demo-fixture'
import { DEMO_TEAM_POST_INDEXES } from './seed-demo-social'

const MASONRY_POST_KEYS = [
  'official-photo-note',
  'community-night-album',
  'community-wide-crop',
  'community-tall-crop',
  'community-day-album',
  'community-short-note',
  'community-long-note',
  'community-banner-crop',
] as const

/** Inserts the staggered-feed demo posts without resetting the rest of the fixture. */
export async function installMasonryDemoPosts(prisma: PrismaClient): Promise<number> {
  const definitions = MASONRY_POST_KEYS.map((key) => {
    const definition = DEMO_POSTS.find((post) => post.key === key)
    if (!definition) throw new Error(`缺少演示动态：${key}`)
    return definition
  })
  return prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findFirst({
      where: { organizationId: DEMO_ORGANIZATION_ID, tournamentCode: 'DEMO-GREEN-CUP-2026' },
      select: { id: true },
    })
    if (!tournament) throw new Error('演示赛事不存在；本脚本不会重新初始化数据库')
    const usernames = [
      ...new Set(definitions.map((definition) => definition.authorUsername ?? 'admin')),
    ]
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
      const teamIndex = DEMO_TEAM_POST_INDEXES[definition.key]
      const team = teamIndex === undefined ? undefined : DEMO_TEAMS[teamIndex]
      const postId = fixtureId(`post:${definition.key}`)
      const exists = await tx.post.findUnique({
        where: { id: postId },
        select: { organizationId: true },
      })
      if (exists && exists.organizationId !== DEMO_ORGANIZATION_ID)
        throw new Error('动态示例 ID 与其他组织记录冲突')
      const data = {
        organizationId: DEMO_ORGANIZATION_ID,
        tournamentId: isPlatformDemoPost(definition) ? null : tournament.id,
        authorUserId,
        teamId: team ? fixtureId(`team:${team.code}`) : null,
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
    if (inserted > 0) {
      await tx.auditLog.create({
        data: {
          organizationId: DEMO_ORGANIZATION_ID,
          actorType: AuditActorType.SYSTEM,
          actorRoleSnapshot: [],
          action: 'DEMO_MASONRY_POSTS_INSTALLED',
          targetType: 'Tournament',
          targetId: tournament.id,
          afterSummary: { masonryPostCount: definitions.length, inserted },
          reason: '为绿茵动态错落版式补充演示图文，不改写比赛记录',
          requestId: 'masonry-demo-posts-2026-10-10',
          source: 'LOCAL_DEMO',
        },
      })
    }
    return inserted
  })
}

if (require.main === module) {
  const prisma = new PrismaClient()
  void installMasonryDemoPosts(prisma)
    .then((count) => console.log(`Masonry demo posts ready: ${count} added.`))
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
