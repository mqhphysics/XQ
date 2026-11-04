import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AuditActorType, PrismaClient } from '../generated/prisma/client'
import { validateMedia } from '../managed-media/media-image'
import { MediaStorage } from '../managed-media/media-storage'
import { eventSignature } from '../managed-media/managed-media.service'
import { DEMO_ORGANIZATION_ID, fixtureId } from './demo-fixture'

/**
 * Attaches freely licensed football GIFs (see assets/goal-gifs/CREDITS.md) to the first goals of
 * finished demo matches, through the same validation/storage path as a real GOAL_GIF upload.
 * Idempotent; never touches user-submitted media.
 */
const GIFS = ['goal-1.gif', 'goal-3.gif', 'goal-4.gif']
const LIMIT = 10

export async function installDemoGoalGifs(prisma: PrismaClient): Promise<number> {
  const storage = new MediaStorage()
  const reviewerId = fixtureId('user:admin')
  const media = await Promise.all(
    GIFS.map(async (file) => {
      const source = await readFile(resolve(__dirname, 'assets/goal-gifs', file))
      return validateMedia(`data:image/gif;base64,${source.toString('base64')}`, 'GOAL_GIF')
    }),
  )
  const events = await prisma.matchEvent.findMany({
    where: {
      organizationId: DEMO_ORGANIZATION_ID,
      type: 'GOAL',
      match: { status: 'FINISHED', tournament: { status: 'PUBLISHED' } },
    },
    include: {
      match: { select: { title: true } },
      player: { select: { displayName: true } },
      team: { select: { name: true, shortName: true } },
    },
    orderBy: [{ match: { scheduledStartAt: 'desc' } }, { minute: 'asc' }],
    take: LIMIT,
  })
  let inserted = 0
  for (const [index, event] of events.entries()) {
    const id = fixtureId(`media:goal-gif:${event.id}`)
    if (await prisma.managedMediaAsset.findUnique({ where: { id }, select: { id: true } })) continue
    const gif = media[index % media.length]!
    const stored = await storage.read(DEMO_ORGANIZATION_ID, id, false).catch(() => null)
    if (!stored) await storage.store(DEMO_ORGANIZATION_ID, id, gif)
    await prisma.managedMediaAsset.create({
      data: {
        id,
        organizationId: DEMO_ORGANIZATION_ID,
        uploaderUserId: reviewerId,
        clientSubmissionId: `demo-goal-gif-${event.id}`,
        purpose: 'GOAL_GIF',
        targetId: event.id,
        matchId: event.matchId,
        eventSignature: eventSignature(event),
        targetLabel: `${event.match.title} · ${event.minute}′ · ${event.player?.displayName ?? event.team.shortName ?? event.team.name}`.slice(0, 320),
        checksum: gif.checksum,
        mimeType: gif.mimeType,
        bytes: gif.body.length,
        width: gif.width,
        height: gif.height,
        frames: gif.frames,
        durationMs: gif.durationMs,
        status: 'APPROVED',
        reviewedByUserId: reviewerId,
        reviewedAt: new Date(),
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
        action: 'DEMO_GOAL_GIFS_INSTALLED',
        targetType: 'Organization',
        targetId: DEMO_ORGANIZATION_ID,
        afterSummary: { inserted },
        reason: '为已完赛比赛的进球事件添加授权开放的示例 GIF',
        requestId: 'demo-goal-gifs-2026-10-14',
        source: 'LOCAL_DEMO',
      },
    })
  return inserted
}

if (require.main === module) {
  const prisma = new PrismaClient()
  void installDemoGoalGifs(prisma)
    .then((count) => console.log(`Demo goal GIFs ready: ${count} added.`))
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
