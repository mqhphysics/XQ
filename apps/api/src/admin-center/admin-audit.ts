import type { Prisma } from '../generated/prisma/client'
import { safeAuditSummary } from './admin-center.policy'
import { mediaPolicies } from '../media/media-access-policy'

export const ordinaryAuditWhere: Prisma.AuditLogWhereInput = { OR: [
  { action: { endsWith: '_VIEWED' } }, { action: { endsWith: '_PREVIEWED' } },
  { action: { in: ['LOGIN', 'EMAIL_LOGIN', 'EMAIL_CODE_REQUESTED', 'SESSION_REVOKED', 'LOCAL_OWNER_SESSION_STARTED'] } },
] }
const profileFields = ['name', 'shortName', 'displayName', 'jerseyName', 'collegeName', 'description', 'motto',
  'primaryColor', 'secondaryColor', 'position', 'secondaryPosition', 'dominantFoot', 'heightCm', 'bio',
  'avatarUrl', 'coverUrl', 'crestUrl', 'portraitUrl', 'academicYear', 'major', 'hometown']

export function businessAuditSummary(type: string, value: unknown): Record<string, unknown> | null {
  const safe = safeAuditSummary(value) ?? {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.keys(safe).length ? safe : null
  const input = value as Record<string, unknown>
  const fields = input.fields && typeof input.fields === 'object' && !Array.isArray(input.fields)
    ? input.fields as Record<string, unknown> : input
  const allowed = ['Team', 'TeamRegistration', 'User', 'PlayerProfile'].includes(type) ? profileFields
    : type === 'StudentRecord' ? ['realName', 'studentNumber', 'academicYear', 'collegeName']
    : ['Post', 'PostComment'].includes(type) ? ['title', 'body', 'imageUrl'] : []
  for (const key of allowed) {
    const item = fields[key]
    if (item === null || typeof item === 'number' || typeof item === 'boolean' ||
      (typeof item === 'string' && item.length <= 4000)) safe[key] = item
  }
  return Object.keys(safe).length ? safe : null
}

export async function auditContext(tx: Prisma.TransactionClient, org: string,
  row: { targetType: string; targetId: string; beforeSummary: unknown; afterSummary: unknown }) {
  const before = businessAuditSummary(row.targetType, row.beforeSummary)
  const after = businessAuditSummary(row.targetType, row.afterSummary)
  let targetName = row.targetType, userId: string | null = null
  let teamChange: Record<string, unknown> | null = null
  let mediaReview: Record<string, unknown> | null = null
  let mediaUrls: string[] = []
  let currentAvatar: string | null = null
  const id = row.targetId
  // Imported audit targets can be arbitrary strings, never send them to UUID queries.
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
    if (row.targetType === 'User') {
      const user = await tx.user.findFirst({ where: { id, memberships: { some: { organizationId: org } } }, select: { displayName: true, realName: true, avatarUrl: true } })
      if (user) { targetName = user.realName || user.displayName; userId = id; currentAvatar = user.avatarUrl }
    } else if (row.targetType === 'StudentRecord') {
      const student = await tx.studentRecord.findFirst({ where: { id, organizationId: org }, select: { realName: true, user: { select: { id: true } } } })
      if (student) { targetName = student.realName; userId = student.user?.id ?? null }
    } else if (['Team', 'TeamRegistration'].includes(row.targetType)) {
      const registration = row.targetType === 'TeamRegistration'
        ? await tx.teamRegistration.findFirst({ where: { id, organizationId: org }, include: { team: true } }) : null
      const team = registration?.team ?? (row.targetType === 'Team'
        ? await tx.team.findFirst({ where: { id, organizationId: org } }) : null)
      if (team) {
        targetName = team.name
        const snapshot = registration?.teamProfileSnapshot
        const current = { ...team, ...(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {}) } as Record<string, unknown>
        const keys = Object.keys(after ?? {}).filter(key => ['name', 'shortName', 'collegeName', 'description', 'motto', 'primaryColor', 'secondaryColor'].includes(key) && Object.hasOwn(before ?? {}, key) && before![key] !== after![key])
        if (keys.length && keys.every(key => current[key] === after![key])) {
          const patch = Object.fromEntries(keys.map(key => [key, before![key]]))
          teamChange = {
            path: registration ? `/admin/campus/team-seasons/${id}` : `/admin/center/teams/${id}`,
            body: registration ? { ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value ?? ''])),
              name: patch.name ?? current.name, expectedUpdatedAt: registration.updatedAt.toISOString() }
              : { patch, expectedUpdatedAt: team.updatedAt.toISOString() },
          }
        }
      }
    } else if (row.targetType === 'PlayerProfile') {
      const player = await tx.playerProfile.findFirst({ where: { id, organizationId: org }, select: { displayName: true, avatarUrl: true, linkedUser: { select: { id: true } } } })
      if (player) { targetName = player.displayName; userId = player.linkedUser?.id ?? null; currentAvatar = player.avatarUrl }
    } else if (row.targetType === 'ManagedMediaAsset') {
      const asset = await tx.managedMediaAsset.findFirst({ where: { id, organizationId: org } })
      if (asset) {
        targetName = asset.targetLabel; userId = asset.uploaderUserId
        mediaUrls = [`/api/media-assets/${id}/content`]
        const ai = await tx.aiModerationReview.findFirst({ where: { organizationId: org, resourceType: 'MEDIA', targetId: id, status: { not: 'STALE' } }, orderBy: { createdAt: 'desc' } })
        mediaReview = { assetId: id, version: asset.version, status: asset.status, reviewedAt: asset.reviewedAt, aiReviewId: ai?.id ?? null }
      }
    } else if (row.targetType === 'IdentityApplication') {
      const app = await tx.identityApplication.findFirst({ where: { id, organizationId: org }, include: { user: { select: { realName: true, displayName: true } } } })
      if (app) { targetName = app.user.realName || app.user.displayName; userId = app.userId }
    } else if (row.targetType === 'Post') {
      const post = await tx.post.findFirst({ where: { id, organizationId: org }, select: { title: true, authorUserId: true, imageUrl: true } })
      if (post) { targetName = post.title || '动态'; userId = post.authorUserId }
    }
  }
  if (typeof after?.avatarUrl === 'string' && ['User', 'PlayerProfile'].includes(row.targetType)) {
    const ai = await tx.aiModerationReview.findFirst({ where: {
      organizationId: org, targetId: id, resourceType: row.targetType === 'User' ? 'USER_AVATAR' : 'PLAYER_AVATAR',
      contentVersion: after.avatarUrl, status: { not: 'STALE' },
    }, orderBy: { createdAt: 'desc' } })
    if (ai) mediaReview = { aiReviewId: ai.id, reviewedAt: ai.reviewedAt, status: ai.status }
  }
  for (const summary of [before, after]) for (const [key, value] of Object.entries(summary ?? {})) {
    if (/Url$/.test(key) && typeof value === 'string') {
      try { const urls = value.startsWith('[') ? JSON.parse(value) : [value]; for (const url of urls) if (typeof url === 'string' && url.startsWith('/api/media/')) mediaUrls.push(url) } catch { /* Older summaries may not contain a valid image list. */ }
    }
  }
  let imageAction: Record<string, unknown> | null = null
  if (currentAvatar && currentAvatar === after?.avatarUrl && currentAvatar.startsWith('/api/media/avatars/')) {
    const policy = (await mediaPolicies(tx, currentAvatar, org))[0]?.state as Record<string, unknown> | undefined
    imageAction = { url: currentAvatar, expectedVersion: Number(policy?.policyVersion ?? 0) }
  }
  return { before, after, targetName, relatedUserId: userId, mediaUrls: [...new Set(mediaUrls)], mediaReview, teamChange, imageAction }
}
