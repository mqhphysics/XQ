import { Controller, Get, Headers, Inject, Ip, Req } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { ApiErrorResponseDto } from '../common/api-error-response.dto'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { AdminIdentityDto } from './auth.dto'
import { AuthService } from './auth.service'

@ApiTags('admin identities')
@ApiBearerAuth()
@Controller('admin/identities')
export class AdminIdentityController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get()
  @ApiOperation({ summary: '组织管理员读取本组织实名账号目录' })
  @ApiOkResponse({ type: [AdminIdentityDto] })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  list(
    @Headers('authorization') authorization: string | undefined,
    @Ip() ip: string,
    @Req() request: RequestWithId,
  ): Promise<AdminIdentityDto[]> {
    return this.authService.listOrganizationIdentities(authorization, {
      ip,
      requestId: getRequestId(request),
      userAgent: request.headers['user-agent'],
    })
  }
}
