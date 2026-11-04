import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { ApiHttpException } from './common/api-http.exception'
import { PrismaService } from './database/prisma.service'
import type { LivenessResponseDto, ReadinessResponseDto } from './health-response.dto'

@Injectable()
export class AppService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  liveness(requestId: string): LivenessResponseDto {
    return {
      service: 'api',
      status: 'ok',
      version: process.env.APP_VERSION ?? '0.1.0',
      timestamp: new Date().toISOString(),
      requestId,
    }
  }

  async readiness(requestId: string): Promise<ReadinessResponseDto> {
    const startedAt = performance.now()

    try {
      await this.prisma.$queryRawUnsafe('SELECT 1')
    } catch {
      const latencyMs = Math.round((performance.now() - startedAt) * 100) / 100

      throw new ApiHttpException(HttpStatus.SERVICE_UNAVAILABLE, {
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: '数据库连接不可用',
        details: {
          database: {
            status: 'down',
            latencyMs,
          },
        },
      })
    }

    return {
      ...this.liveness(requestId),
      database: {
        status: 'ok',
        latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      },
    }
  }
}
