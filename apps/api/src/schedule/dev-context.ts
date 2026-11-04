import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import type { Request } from 'express'
import type { RequestWithId } from '../common/request-context'

import { ApiHttpException } from '../common/api-http.exception'

export const P1_DEV_ORGANIZATION_HEADER = 'x-dev-organization-id'
export const P1_DEV_ROLE_HEADER = 'x-dev-role'
export const P1_TOURNAMENT_ADMIN_ROLE = 'TOURNAMENT_ADMIN'

export interface P1DevAdminContext {
  organizationId: string
  role: typeof P1_TOURNAMENT_ADMIN_ROLE
}

export function getHeaderValue(request: Request, name: string): string | undefined {
  const value = request.headers[name]

  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

export function requireP1DevOrganizationId(request: Request): string {
  const organizationId = (request as RequestWithId).organizationId

  if (typeof organizationId !== 'string' || organizationId.trim() === '') {
    throw new ApiHttpException(HttpStatus.FORBIDDEN, {
      code: ERROR_CODES.FORBIDDEN,
      message: '缺少服务端校验后的组织上下文',
    })
  }

  return organizationId
}

export function requireP1DevAdminContext(request: Request): P1DevAdminContext {
  const organizationId = requireP1DevOrganizationId(request)
  const session = (request as RequestWithId).authenticatedSession

  if (
    !session ||
    session.organizationId !== organizationId ||
    !(request as RequestWithId).scheduleAdministratorAuthorized
  ) {
    throw new ApiHttpException(HttpStatus.FORBIDDEN, {
      code: ERROR_CODES.FORBIDDEN,
      message: '管理接口需要服务端校验后的对象权限',
    })
  }

  return {
    organizationId,
    role: P1_TOURNAMENT_ADMIN_ROLE,
  }
}
