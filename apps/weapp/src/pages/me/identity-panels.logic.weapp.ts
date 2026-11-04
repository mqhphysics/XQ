import type { AuthUser } from '../../features/product/product.types'
export type NativeIdentityKind = 'player' | 'reporter'
export function nativeIdentityKinds(
  user: AuthUser,
  available: readonly string[] = [],
): NativeIdentityKind[] {
  const kinds: NativeIdentityKind[] = []
  const roles = new Set(user.roles.map((item) => item.role))
  if (
    user.linkedPlayer ||
    user.verificationLevel === 'PLAYER_CONFIRMED' ||
    roles.has('TEAM_CAPTAIN') ||
    available.includes('player') ||
    available.includes('captain')
  )
    kinds.push('player')
  if (
    ['MATCH_REPORTER', 'PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'TOURNAMENT_ADMIN'].some((role) =>
      roles.has(role),
    ) ||
    available.includes('reporter')
  )
    kinds.push('reporter')
  return kinds
}
