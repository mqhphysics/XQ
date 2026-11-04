import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from '../common/api-http.exception'
import type { AuthenticatedSession } from './auth.service'

export const TEST_ROLES = [
  { id: 'STUDENT', label: '普通用户' },
  { id: 'PLAYER', label: '球员' },
  { id: 'TEAM_CAPTAIN', label: '队长' },
  { id: 'TEAM_COACH', label: '教练' },
  { id: 'MATCH_REPORTER', label: '信息员' },
  { id: 'ADMIN', label: '管理员（返回本人）' },
] as const
export type TestRole = (typeof TEST_ROLES)[number]['id']

export function requireTestRoleController(actor: AuthenticatedSession, env = process.env): void {
  const allowed =
    env.DEMO_ROLE_SWITCH_ENABLED === 'true' &&
    env.DEMO_ROLE_SWITCH_OWNER_ID === actor.userId &&
    env.DEMO_FIXTURE_ORGANIZATION_ID === actor.organizationId &&
    actor.user.roles.some(
      (role) =>
        (role.role === 'ORGANIZATION_ADMIN' &&
          role.scopeType === 'ORGANIZATION' &&
          role.scopeId === actor.organizationId) ||
        (role.role === 'PLATFORM_ADMIN' && role.scopeType === 'PLATFORM'),
    )
  if (!allowed)
    throw new ApiHttpException(HttpStatus.FORBIDDEN, {
      code: ERROR_CODES.FORBIDDEN,
      message: '测试角色切换仅向指定的模拟赛事管理账号开放',
    })
}
