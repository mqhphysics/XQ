import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { GettingStartedService } from './getting-started.service'
import {
  GettingStartedActionDto,
  GettingStartedCompleteDto,
  GettingStartedPlayerClaimDto,
  GettingStartedResponseDto,
} from './getting-started.dto'
@Controller('me/getting-started')
@ApiTags('getting-started')
@ApiBearerAuth()
@AuthorizeInApplicationService()
export class GettingStartedController {
  constructor(@Inject(GettingStartedService) private readonly service: GettingStartedService) {}
  @Get()
  @ApiOkResponse({ type: GettingStartedResponseDto })
  read(@Headers('authorization') auth: string | undefined) {
    return this.service.read(auth)
  }
  @Post('match')
  @HttpCode(200)
  @ApiBody({ type: GettingStartedActionDto })
  @ApiOkResponse({ type: GettingStartedResponseDto })
  match(
    @Headers('authorization') auth: string | undefined,
    @Body() body: GettingStartedActionDto,
    @Req() req: RequestWithId,
  ) {
    return this.service.match(auth, body, getRequestId(req))
  }
  @Post('player')
  @HttpCode(200)
  @ApiBody({ type: GettingStartedPlayerClaimDto })
  @ApiOkResponse({ type: GettingStartedResponseDto })
  claim(
    @Headers('authorization') auth: string | undefined,
    @Body() body: GettingStartedPlayerClaimDto,
    @Req() req: RequestWithId,
  ) {
    return this.service.claim(auth, body, getRequestId(req))
  }
  @Post('complete')
  @HttpCode(200)
  @ApiBody({ type: GettingStartedCompleteDto })
  complete(
    @Headers('authorization') auth: string | undefined,
    @Body() body: GettingStartedCompleteDto,
    @Req() req: RequestWithId,
  ) {
    return this.service.complete(auth, body, getRequestId(req))
  }
}
