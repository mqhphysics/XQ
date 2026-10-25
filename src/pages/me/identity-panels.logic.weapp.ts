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
  if (roles.has('MATCH_REPORTER') || available.includes('reporter')) kinds.push('reporter')
  return kinds
}
