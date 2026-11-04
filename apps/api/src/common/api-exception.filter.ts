import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common'
import { ERROR_CODES, isErrorCode, type ApiErrorResponse, type ErrorCode } from '@xiaoqiu/contracts'
import type { Response } from 'express'

import type { ApiHttpExceptionBody } from './api-http.exception'
import { getRequestId, type RequestWithId } from './request-context'
import { getSafeRequestPath } from './safe-request-path'

const STATUS_ERROR_CODES: Readonly<Partial<Record<number, ErrorCode>>> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_CODES.CONFLICT,
  [HttpStatus.SERVICE_UNAVAILABLE]: ERROR_CODES.SERVICE_UNAVAILABLE,
}

const STATUS_MESSAGES: Readonly<Partial<Record<number, string>>> = {
  [HttpStatus.BAD_REQUEST]: '请求无效',
  [HttpStatus.UNAUTHORIZED]: '需要登录',
  [HttpStatus.FORBIDDEN]: '无权执行此操作',
  [HttpStatus.NOT_FOUND]: '资源不存在',
  [HttpStatus.CONFLICT]: '请求与当前资源状态冲突',
  [HttpStatus.SERVICE_UNAVAILABLE]: '服务暂时不可用',
}

function isApiHttpExceptionBody(value: unknown): value is ApiHttpExceptionBody {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<ApiHttpExceptionBody>
  return isErrorCode(candidate.code) && typeof candidate.message === 'string'
}

function internalErrorCodes(exception: unknown): string[] {
  if (typeof exception !== 'object' || exception === null) return []

  const candidate = exception as { code?: unknown; meta?: unknown }
  const nestedCode =
    typeof candidate.meta === 'object' && candidate.meta !== null
      ? (candidate.meta as { code?: unknown }).code
      : undefined
  return [...new Set([candidate.code, nestedCode])].filter(
    (code): code is string =>
      typeof code === 'string' &&
      code.length === 5 &&
      /^(?:P\d{4}|(?:\d{2}|F0|HV|P0|XX)[0-9A-Z]{3})$/.test(code),
  )
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const request = http.getRequest<RequestWithId>()
    const response = http.getResponse<Response>()
    const requestId = getRequestId(request)
    // A malformed id (e.g. a non-UUID path segment) reaching the database is the client's
    // error, not a server fault: Prisma P2023 / PostgreSQL 22P02 → 400.
    const malformedInput =
      !(exception instanceof HttpException) &&
      internalErrorCodes(exception).some((item) => item === 'P2023' || item === '22P02')
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : malformedInput
          ? HttpStatus.BAD_REQUEST
          : HttpStatus.INTERNAL_SERVER_ERROR
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined

    let code = STATUS_ERROR_CODES[status] ?? ERROR_CODES.INTERNAL_ERROR
    let message = STATUS_MESSAGES[status] ?? '服务器内部错误'
    let details: Record<string, unknown> | undefined

    if (malformedInput) message = '请求中的编号无效'
    if (isApiHttpExceptionBody(exceptionResponse)) {
      code = exceptionResponse.code
      message = exceptionResponse.message
      details = exceptionResponse.details
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const internalCodes = internalErrorCodes(exception)
      this.logger.error(
        JSON.stringify({
          code,
          method: request.method,
          path: getSafeRequestPath(request),
          requestId,
          status,
          ...(internalCodes.length ? { internalCodes } : {}),
        }),
      )
    }

    const body: ApiErrorResponse = {
      code,
      message,
      requestId,
      ...(details === undefined ? {} : { details }),
    }

    response.status(status).json(body)
  }
}
