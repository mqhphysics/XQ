export type IdentityBadgeKind =
  | 'operator'
  | 'captain'
  | 'coach'
  | 'reporter'
  | 'admin'
  | 'official'
  | 'referee'
  | 'reviewer'
  | 'player'
  | 'student'
  | 'profile'
export const identityLabels: Record<IdentityBadgeKind, string> = {
  operator: '网站运营',
  captain: '认证队长',
  coach: '认证教练',
  reporter: '信息管理员',
  admin: '赛事管理员',
  official: '官方账号',
  referee: '比赛官员',
  reviewer: '审核员',
  player: '认证球员',
  student: '认证学生',
  profile: '球员档案',
}
export function identityBadgeKinds(
  level?: string | null,
  roles: readonly (string | { role: string })[] = [],
  official = false,
): IdentityBadgeKind[] {
  if (official) return ['official']
  const values = new Set(roles.map((role) => (typeof role === 'string' ? role : role.role)))
  const badges: IdentityBadgeKind[] = []
  if (values.has('PLATFORM_ADMIN') || values.has('ORGANIZATION_ADMIN')) badges.push('operator')
  if (values.has('TOURNAMENT_ADMIN')) badges.push('admin')
  if (values.has('MATCH_REPORTER')) badges.push('reporter')
  if (values.has('REVIEWER')) badges.push('reviewer')
  if (values.has('OFFICIAL')) badges.push('referee')
  if (values.has('TEAM_CAPTAIN')) badges.push('captain')
  if (values.has('TEAM_COACH')) badges.push('coach')
  if (level === 'PLAYER_CONFIRMED') badges.push('player')
  else if (level === 'STUDENT_VERIFIED') badges.push('student')
  else if (level === 'PLAYER_PROFILE') badges.push('profile')
  return badges
}

export function displayedBadgeKind(
  level?: string | null,
  roles: readonly (string | { role: string })[] = [],
  official = false,
  preferred?: string | null,
): IdentityBadgeKind | null {
  const kinds = identityBadgeKinds(level, roles, official)
  return preferred && kinds.includes(preferred as IdentityBadgeKind)
    ? (preferred as IdentityBadgeKind)
    : (kinds[0] ?? null)
}
