import { HttpException, type HttpStatus } from '@nestjs/common'
import type { ErrorCode } from '@xiaoqiu/contracts'

export interface ApiHttpExceptionBody {
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
}

export class ApiHttpException extends HttpException {
  constructor(status: HttpStatus, body: ApiHttpExceptionBody) {
    super(body, status)
  }
}
