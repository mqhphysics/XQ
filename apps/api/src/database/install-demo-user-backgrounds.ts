import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { AuditActorType, PrismaClient } from '../generated/prisma/client'
import { validateMedia } from '../managed-media/media-image'
import { MediaStorage } from '../managed-media/media-storage'
import { DEMO_ORGANIZATION_ID, fixtureId } from './demo-fixture'

/**
 * Demo personal covers (USER_BACKGROUND managed media) so the 我的 profile card shows a cover
 * like the team card. Uses the same validation/storage path as a real upload and is idempotent:
 * existing rows are left untouched; other users' media is never modified.
 */
const COVERS: ReadonlyArray<[username: string, file: string]> = [
  ['captain', 'home-team-huddle.webp'],
  ['player', 'home-campus-action.webp'],
  ['student', 'home-team-celebration.webp'],
  ['admin', 'match-floodlight.png'],
]

function assetPath(file: string) {
  return resolve(__dirname, '../../../mini-program/src/assets/home-visual', file)
}

export async function installDemoUserBackgrounds(prisma: PrismaClient): Promise<number> {
  const storage = new MediaStorage()
  const reviewerId = fixtureId('user:admin')
  let inserted = 0
  for (const [username, file] of COVERS) {
    const userId = fixtureId(`user:${username}`)
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        memberships: { some: { organizationId: DEMO_ORGANIZATION_ID, status: 'ACTIVE' } },
      },
      select: { id: true, displayName: true },
    })
    if (!user) continue
    const id = fixtureId(`media:user-background:${username}`)
    const existing = await prisma.managedMediaAsset.findUnique({
      where: { id },
      select: { id: true },
    })
    if (existing) continue
    const subtype = extname(file) === '.png' ? 'png' : 'webp'
    const source = await readFile(assetPath(file))
    const media = await validateMedia(
      `data:image/${subtype};base64,${source.toString('base64')}`,
      'USER_BACKGROUND',
    )
    // Bytes may survive a database reset; reuse them when the checksum still matches.
    const stored = await storage.read(DEMO_ORGANIZATION_ID, id, false).catch(() => null)
    if (!stored) await storage.store(DEMO_ORGANIZATION_ID, id, media)
    else if (!stored.equals(media.body)) throw new Error(`演示背景文件与预期不一致：${id}`)
    await prisma.managedMediaAsset.create({
      data: {
        id,
        organizationId: DEMO_ORGANIZATION_ID,
        uploaderUserId: user.id,
        clientSubmissionId: `demo-user-background-${username}`,
        purpose: 'USER_BACKGROUND',
        targetId: user.id,
        targetLabel: user.displayName,
        checksum: media.checksum,
        mimeType: media.mimeType,
        bytes: media.body.length,
        width: media.width,
        height: media.height,
        frames: media.frames,
        durationMs: media.durationMs,
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
        action: 'DEMO_USER_BACKGROUNDS_INSTALLED',
        targetType: 'Organization',
        targetId: DEMO_ORGANIZATION_ID,
        afterSummary: { inserted },
        reason: '为演示账户添加个人背景图，用于「我的」资料卡展示',
        requestId: 'demo-user-backgrounds-2026-10-14',
        source: 'LOCAL_DEMO',
      },
    })
  return inserted
}

if (require.main === module) {
  const prisma = new PrismaClient()
  void installDemoUserBackgrounds(prisma)
    .then((count) => console.log(`Demo user backgrounds ready: ${count} added.`))
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
