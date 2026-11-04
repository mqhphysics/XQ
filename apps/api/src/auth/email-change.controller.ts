import { Body, Controller, Headers, HttpCode, Inject, Ip, Post, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { AuthorizeInApplicationService } from './application-authorization'
import { EmailChangeService } from './email-change.service'
import { EmailChangeCodeDto, EmailChangeVerifyDto } from './email-change.dto'
@Controller('auth/email/change')
@ApiTags('email-change')
@ApiBearerAuth()
@AuthorizeInApplicationService()
export class EmailChangeController {
  constructor(@Inject(EmailChangeService) private readonly service: EmailChangeService) {}
  @Post('start')
  @HttpCode(200)
  start(@Headers('authorization') authorization: string | undefined) {
    return this.service.start(authorization)
  }
  @Post('code')
  @ApiBody({ type: EmailChangeCodeDto })
  @HttpCode(202)
  code(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: EmailChangeCodeDto,
    @Ip() ip: string,
    @Req() req: RequestWithId,
  ) {
    return this.service.requestCode(authorization, body, {
      ip,
      requestId: getRequestId(req),
      userAgent: req.headers['user-agent'],
    })
  }
  @Post('verify-old')
  @ApiBody({ type: EmailChangeVerifyDto })
  @HttpCode(200)
  verifyOld(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: EmailChangeVerifyDto,
  ) {
    return this.service.verifyOld(authorization, body)
  }
  @Post('complete')
  @ApiBody({ type: EmailChangeVerifyDto })
  @HttpCode(200)
  complete(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: EmailChangeVerifyDto,
    @Ip() ip: string,
    @Req() req: RequestWithId,
  ) {
    return this.service.complete(authorization, body, {
      ip,
      requestId: getRequestId(req),
      userAgent: req.headers['user-agent'],
    })
  }
}
