import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { getOrganizationId, type RequestWithId } from '../common/request-context'
import { FocusMatchesService } from './focus-matches.service'
import { FocusMatchesDto, MatchInterestDto } from './focus-matches.dto'

@ApiTags('recommendation')
@Controller()
export class FocusMatchesController {
  constructor(@Inject(FocusMatchesService) private readonly focus: FocusMatchesService) {}

  @Get('public/focus-matches')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: FocusMatchesDto })
  list(
    @Req() request: RequestWithId,
    @Query('tournamentId', ParseUUIDPipe) tournamentId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.focus.list(getOrganizationId(request), tournamentId, authorization)
  }

  @Put('matches/:matchId/interest')
  @ApiBearerAuth()
  @ApiOkResponse({ type: MatchInterestDto })
  record(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.focus.record(authorization, matchId)
  }
}
