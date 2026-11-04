export const BADGE_KINDS = [
  'operator',
  'admin',
  'reporter',
  'reviewer',
  'referee',
  'captain',
  'coach',
  'player',
  'student',
  'profile',
  'official',
] as const
export type BadgeKind = (typeof BADGE_KINDS)[number]
export function badgeOptions(
  level: string,
  roles: readonly (string | { role: string })[],
): BadgeKind[] {
  const values = new Set(roles.map((role) => (typeof role === 'string' ? role : role.role)))
  const options: BadgeKind[] = []
  if (values.has('PLATFORM_ADMIN') || values.has('ORGANIZATION_ADMIN')) options.push('operator')
  if (values.has('TOURNAMENT_ADMIN')) options.push('admin')
  if (values.has('MATCH_REPORTER')) options.push('reporter')
  if (values.has('REVIEWER')) options.push('reviewer')
  if (values.has('OFFICIAL')) options.push('referee')
  if (values.has('TEAM_CAPTAIN')) options.push('captain')
  if (values.has('TEAM_COACH')) options.push('coach')
  if (level === 'PLAYER_CONFIRMED') options.push('player')
  else if (level === 'STUDENT_VERIFIED') options.push('student')
  return options
}
export function preferredBadge(level: string, roles: readonly string[], requested?: string | null) {
  const options = badgeOptions(level, roles)
  return requested && options.includes(requested as BadgeKind) ? requested : (options[0] ?? null)
}
