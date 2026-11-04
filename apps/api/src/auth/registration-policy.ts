import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from '../common/api-http.exception'

export const REGISTRATION_CLOSED_MESSAGE = '测试阶段暂未开放注册'

/**
 * Public self-registration switch. Production defaults to closed unless
 * REGISTRATION_ENABLED=true; local/dev defaults to open unless set to false.
 * Admin-created accounts and login are unaffected.
 */
export function registrationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.REGISTRATION_ENABLED?.trim().toLowerCase()
  if (flag === 'true' || flag === '1') return true
  if (flag === 'false' || flag === '0') return false
  return env.NODE_ENV !== 'production'
}

export function assertRegistrationOpen(env: NodeJS.ProcessEnv = process.env): void {
  if (registrationEnabled(env)) return
  throw new ApiHttpException(HttpStatus.FORBIDDEN, {
    code: ERROR_CODES.FORBIDDEN,
    message: REGISTRATION_CLOSED_MESSAGE,
    details: { reason: 'REGISTRATION_CLOSED' },
  })
}
