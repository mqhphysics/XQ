// Explicit projection: public profiles never read or return identity documents,
// student IDs, email, login names, credentials, role scopes or session tokens.
import { preferredBadge } from '../social/badge-preference.rules'
import { defaultAvatar, defaultCover } from '../media/default-media'
export const publicIdentitySelect = {
  id: true,
  displayName: true,
  avatarUrl: true,
  coverUrl: true,
  showPlayerIdentity: true,
  profileCohort: true,
  bio: true,
  verificationLevel: true,
  status: true,
  badgePreferences: { select: { organizationId: true, preferredKind: true } },
  memberships: { select: { organizationId: true, status: true } },
  playerProfile: { select: { id: true, organizationId: true, avatarUrl: true } },
  roleAssignments: {
    where: { revokedAt: null },
    select: { organizationId: true, role: true, scopeType: true, revokedAt: true },
  },
} as const

export interface PublicIdentitySource {
  id: string
  displayName: string
  verificationLevel: string
  avatarUrl: string | null
  coverUrl?: string | null
  showPlayerIdentity?: boolean
  profileCohort?: string
  status?: string
  memberships?: Array<{ organizationId: string; status: string }>
  playerProfile?: { id: string; organizationId: string; avatarUrl: string | null } | null
  roleAssignments?: Array<{
    organizationId: string | null
    role: string
    scopeType: string
    revokedAt?: Date | null
  }>
  badgePreferences?: Array<{ organizationId: string; preferredKind: string | null }>
}

export function publicIdentity(
  user: PublicIdentitySource,
  organizationId?: string,
  viewerId?: string,
) {
  const active = user.status === undefined || user.status === 'ACTIVE'
  const member =
    !user.memberships ||
    user.memberships.some(
      (item) => item.organizationId === organizationId && item.status === 'ACTIVE',
    )
  const roles =
    active && member && organizationId
      ? (user.roleAssignments ?? [])
          .filter(
            (assignment) =>
              !assignment.revokedAt &&
              ((assignment.organizationId === organizationId &&
                assignment.role !== 'PLATFORM_ADMIN') ||
                (assignment.organizationId === null &&
                  assignment.role === 'PLATFORM_ADMIN' &&
                  assignment.scopeType === 'PLATFORM')),
          )
          .map((assignment) => assignment.role)
      : []
  return {
    id: user.id,
    displayName: user.displayName,
    verificationLevel: user.verificationLevel,
    avatarUrl: defaultAvatar('user', user.id, user.avatarUrl),
    coverUrl: defaultCover('user', user.coverUrl),
    showPlayerIdentity: user.showPlayerIdentity !== false,
    roles: [...new Set(roles)],
    displayedBadgeKind: preferredBadge(
      user.verificationLevel,
      roles,
      user.badgePreferences?.find((item) => item.organizationId === organizationId)?.preferredKind,
    ),
    official: user.profileCohort === 'OFFICIAL',
    messageable: active && member && user.id !== viewerId,
  }
}

export const officialIdentity = {
  id: 'official',
  displayName: '晓球赛事组',
  verificationLevel: 'STAFF_VERIFIED',
  avatarUrl: null,
  roles: [] as string[],
  official: true,
  messageable: false,
}
