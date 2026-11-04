import { Body, Controller, Get, Headers, Inject, Put, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiHeader, ApiTags } from '@nestjs/swagger'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { SelfPlayerProfileDto } from './self-player-profile.dto'
import { SelfPlayerProfileService } from './self-player-profile.service'
@Controller('me/player-profile')
@ApiTags('self-profile')
@ApiBearerAuth()
@AuthorizeInApplicationService()
export class SelfPlayerProfileController {
  constructor(
    @Inject(SelfPlayerProfileService) private readonly service: SelfPlayerProfileService,
  ) {}
  @Get() read(@Headers('authorization') authorization: string | undefined) {
    return this.service.read(authorization)
  }
  @Put()
  @ApiBody({ type: SelfPlayerProfileDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  save(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: SelfPlayerProfileDto,
    @Req() req: RequestWithId,
  ) {
    return this.service.save(authorization, body, key, getRequestId(req))
  }
}
