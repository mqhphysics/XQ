import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { getOrganizationId, getRequestId, type RequestWithId } from '../common/request-context'
import { MatchClockService } from './match-clock.service'
import { MatchClockDto, StartMatchClockDto } from './match-clock.dto'

@ApiTags('match-clock')
@Controller()
export class MatchClockController {
  constructor(@Inject(MatchClockService) private readonly clock: MatchClockService) {}
  @Get('public/matches/:matchId/clock')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: MatchClockDto })
  read(
    @Req() request: RequestWithId,
    @Param('matchId', ParseUUIDPipe) id: string,
    @Headers('authorization') auth: string | undefined,
  ) {
    return this.clock.read(getOrganizationId(request), id, auth)
  }
  @Post('matches/:matchId/start')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiBody({ type: StartMatchClockDto })
  @ApiOkResponse({ type: MatchClockDto })
  start(
    @Headers('authorization') auth: string | undefined,
    @Param('matchId', ParseUUIDPipe) id: string,
    @Body() body: StartMatchClockDto,
    @Req() request: RequestWithId,
  ) {
    return this.clock.start(auth, id, body.clientActionId, getRequestId(request))
  }
}
