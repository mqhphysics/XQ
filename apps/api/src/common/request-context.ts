import type { Request } from 'express'
import type { AuthenticatedSession } from '../auth/auth.service'
import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from './api-http.exception'

export interface RequestWithId extends Request {
  requestId?: string
  organizationId?: string
  authenticatedSession?: AuthenticatedSession | undefined
  administeredTournamentIds?: string[] | null
  scheduleAdministratorAuthorized?: boolean
}

export function getRequestId(request: RequestWithId): string {
  return request.requestId ?? 'unknown'
}

export function getOrganizationId(request: RequestWithId): string {
  if (!request.organizationId)
    throw new ApiHttpException(HttpStatus.FORBIDDEN, {
      code: ERROR_CODES.FORBIDDEN,
      message: '缺少服务端校验后的组织上下文',
    })
  return request.organizationId
}
