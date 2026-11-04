import { AuditActorType, PostStatus, PostTagKind, PostType, PrismaClient } from '../generated/prisma/client'
import { matchReportTagKey } from '../experience/match-report-tag'
import { DEMO_ORGANIZATION_ID, fixtureId } from './demo-fixture'

/**
 * Seeds 快报 (OFFICIAL posts tagged `match-report:<matchId>`) for a few recent finished demo
 * matches. Uses the approved goal GIF of the match when there is one, otherwise a demo photo.
 * Matches without a seeded report show no 快报 section. Idempotent.
 */
const LIMIT = 4

export async function installDemoMatchReports(prisma: PrismaClient): Promise<number> {
  const matches = await prisma.match.findMany({
    where: {
      organizationId: DEMO_ORGANIZATION_ID,
      status: 'FINISHED',
      tournament: { status: 'PUBLISHED' },
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      events: {
        where: { type: 'GOAL' },
        orderBy: { minute: 'asc' },
        include: { player: { select: { displayName: true } }, team: { select: { name: true } } },
      },
    },
    orderBy: { scheduledStartAt: 'desc' },
    take: LIMIT,
  })
  const authorUserId = fixtureId('user:reporter')
  const author = await prisma.user.findUnique({ where: { id: authorUserId }, select: { id: true } })
  const fallbackAuthor = author?.id ?? fixtureId('user:admin')
  let inserted = 0
  for (const [index, match] of matches.entries()) {
    const postId = fixtureId(`post:match-report:${match.id}`)
    if (await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })) continue
    const gif = await prisma.managedMediaAsset.findFirst({
      where: { matchId: match.id, purpose: 'GOAL_GIF', status: 'APPROVED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    const imageUrl = gif && index !== 1
      ? `/api/media-assets/${gif.id}/content`
      : `/api/media/demo/photos/0${2 + (index % 7)}.webp`
    const home = match.homeTeam?.name ?? '主队'
    const away = match.awayTeam?.name ?? '客队'
    const score = `${match.homeScore ?? 0}–${match.awayScore ?? 0}`
    const goals = match.events
      .slice(0, 3)
      .map((event) => `${event.minute}′ ${event.player?.displayName ?? event.team.name}`)
    const body = [
      `${home} ${score} ${away}，全场比赛结束。`,
      goals.length ? `进球：${goals.join('、')}。` : '双方均未能破门。',
      '赛后双方球员互相致意，更多数据见比赛事件与双方阵容。',
    ].join('')
    await prisma.post.create({
      data: {
        id: postId,
        organizationId: DEMO_ORGANIZATION_ID,
        tournamentId: match.tournamentId,
        authorUserId: fallbackAuthor,
        type: PostType.OFFICIAL,
        status: PostStatus.PUBLISHED,
        title: `快报｜${home} ${score} ${away}`,
        body,
        imageUrl,
        publishedAt: match.scheduledStartAt
          ? new Date(match.scheduledStartAt.getTime() + 2 * 60 * 60 * 1000)
          : new Date(),
      },
    })
    await prisma.postTag.create({
      data: {
        id: fixtureId(`post-tag:match-report:${match.id}`),
        organizationId: DEMO_ORGANIZATION_ID,
        postId,
        kind: PostTagKind.TOPIC,
        key: matchReportTagKey(match.id),
        label: '比赛快报',
        position: 0,
      },
    })
    inserted += 1
  }
  if (inserted)
    await prisma.auditLog.create({
      data: {
        organizationId: DEMO_ORGANIZATION_ID,
        actorType: AuditActorType.SYSTEM,
        actorRoleSnapshot: [],
        action: 'DEMO_MATCH_REPORTS_INSTALLED',
        targetType: 'Organization',
        targetId: DEMO_ORGANIZATION_ID,
        afterSummary: { inserted },
        reason: '为部分已完赛比赛补充演示快报',
        requestId: 'match-reports-2026-10-14',
        source: 'LOCAL_DEMO',
      },
    })
  return inserted
}

if (require.main === module) {
  const prisma = new PrismaClient()
  void installDemoMatchReports(prisma)
    .then((count) => console.log(`Demo match reports ready: ${count} added.`))
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
