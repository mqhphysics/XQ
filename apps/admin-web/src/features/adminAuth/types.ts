export interface AdminRole {
  role: string
  scopeType: string
  scopeId: string
}

export interface AdminUser {
  id: string
  organizationId: string
  displayName: string
  roles: AdminRole[]
}

export interface AdminCredential {
  accessToken: string
  expiresAt: string
}

export interface AdminSessionState {
  credential: AdminCredential | null
  user: AdminUser | null
  message: string
}

export type AdminKind = 'PLATFORM_ADMIN' | 'ORGANIZATION_ADMIN' | 'TOURNAMENT_ADMIN'

export function adminKind(user: AdminUser): AdminKind | null {
  if (user.roles.some((role) => role.role === 'PLATFORM_ADMIN' && role.scopeType === 'PLATFORM'))
    return 'PLATFORM_ADMIN'
  if (
    user.roles.some(
      (role) =>
        role.role === 'ORGANIZATION_ADMIN' &&
        role.scopeType === 'ORGANIZATION' &&
        role.scopeId.toLowerCase() === user.organizationId,
    )
  )
    return 'ORGANIZATION_ADMIN'
  if (
    user.roles.some(
      (role) =>
        role.role === 'TOURNAMENT_ADMIN' && role.scopeType === 'TOURNAMENT' && isUuid(role.scopeId),
    )
  )
    return 'TOURNAMENT_ADMIN'
  return null
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function parseAdminUser(value: unknown): AdminUser {
  if (!value || typeof value !== 'object') throw new Error('身份响应无效，请重新登录。')
  const source = value as Record<string, unknown>
  if (
    typeof source.id !== 'string' ||
    !isUuid(source.id) ||
    typeof source.organizationId !== 'string' ||
    !isUuid(source.organizationId) ||
    typeof source.displayName !== 'string' ||
    !Array.isArray(source.roles)
  ) {
    throw new Error('身份响应无效，请重新登录。')
  }
  const roles: AdminRole[] = []
  for (const item of source.roles) {
    if (!item || typeof item !== 'object') throw new Error('角色响应无效，请重新登录。')
    const role = item as Record<string, unknown>
    if (
      typeof role.role !== 'string' ||
      typeof role.scopeType !== 'string' ||
      typeof role.scopeId !== 'string'
    )
      throw new Error('角色响应无效，请重新登录。')
    roles.push({ role: role.role, scopeType: role.scopeType, scopeId: role.scopeId })
  }
  // Keep only UI identity fields; never retain the full /auth/me response.
  return {
    id: source.id.toLowerCase(),
    organizationId: source.organizationId.toLowerCase(),
    displayName: source.displayName,
    roles,
  }
}
