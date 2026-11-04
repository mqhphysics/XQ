import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import type { Response } from 'express'
import { finalize, type Observable } from 'rxjs'

import { getRequestId, type RequestWithId } from './request-context'
import { getSafeRequestPath } from './safe-request-path'

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name)

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<RequestWithId>()
    const response = http.getResponse<Response>()
    const startedAt = performance.now()

    return next.handle().pipe(
      finalize(() => {
        this.logger.log(
          JSON.stringify({
            durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
            method: request.method,
            path: getSafeRequestPath(request),
            requestId: getRequestId(request),
            status: response.statusCode,
          }),
        )
      }),
    )
  }
}
