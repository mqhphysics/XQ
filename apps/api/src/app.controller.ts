import { Controller, Get, Inject, Req } from '@nestjs/common'
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger'

import { AppService } from './app.service'
import { ApiErrorResponseDto } from './common/api-error-response.dto'
import { getRequestId, type RequestWithId } from './common/request-context'
import { LivenessResponseDto, ReadinessResponseDto } from './health-response.dto'

@ApiTags('system')
@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get('health/live')
  @ApiOperation({ summary: '检查 API 进程是否存活' })
  @ApiOkResponse({
    description: 'API 进程存活，不检查下游依赖',
    type: LivenessResponseDto,
  })
  liveness(@Req() request: RequestWithId): LivenessResponseDto {
    return this.appService.liveness(getRequestId(request))
  }

  @Get('health')
  @ApiOperation({ summary: '检查 API 是否可接收流量的兼容入口' })
  @ApiOkResponse({
    description: 'API 与 PostgreSQL 均可用',
    type: ReadinessResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'PostgreSQL 不可用，响应使用统一错误结构',
    type: ApiErrorResponseDto,
  })
  health(@Req() request: RequestWithId): Promise<ReadinessResponseDto> {
    return this.appService.readiness(getRequestId(request))
  }

  @Get('health/ready')
  @ApiOperation({ summary: '检查 API 是否可接收流量' })
  @ApiOkResponse({
    description: 'API 与 PostgreSQL 均可用',
    type: ReadinessResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'PostgreSQL 不可用，响应使用统一错误结构',
    type: ApiErrorResponseDto,
  })
  readiness(@Req() request: RequestWithId): Promise<ReadinessResponseDto> {
    return this.appService.readiness(getRequestId(request))
  }
}
