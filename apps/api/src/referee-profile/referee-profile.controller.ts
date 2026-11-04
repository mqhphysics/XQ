import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import { getOrganizationId, getRequestId, type RequestWithId } from '../common/request-context'
import { RefereeProfileService } from './referee-profile.service'
import { RefereeBioDto, RefereeProfileDto, RefereePeopleDto } from './referee-profile.dto'
@Controller()
@ApiTags('referee-profile')
export class RefereeProfileController {
  constructor(@Inject(RefereeProfileService) private readonly service: RefereeProfileService) {}
  @Get('public/people/:userId/referee')
  @ApiOkResponse({ type: RefereeProfileDto })
  read(@Req() req: RequestWithId, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.read(getOrganizationId(req), userId)
  }
  @Get('public/matches/:matchId/referee-people')
  @ApiOkResponse({ type: RefereePeopleDto })
  people(@Req() req: RequestWithId, @Param('matchId', ParseUUIDPipe) matchId: string) {
    return this.service.people(getOrganizationId(req), matchId)
  }
  @Patch('me/referee-profile')
  @ApiBearerAuth()
  @AuthorizeInApplicationService()
  @ApiBody({ type: RefereeBioDto })
  @ApiOkResponse({ type: RefereeProfileDto })
  save(
    @Headers('authorization') auth: string | undefined,
    @Body() body: RefereeBioDto,
    @Req() req: RequestWithId,
  ) {
    return this.service.save(auth, body.bio, getRequestId(req))
  }
}
