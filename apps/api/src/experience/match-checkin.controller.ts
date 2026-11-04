import { Controller, Get, Headers, Inject, Param, ParseUUIDPipe, Put, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger'
import { getOrganizationId, type RequestWithId } from '../common/request-context'
import { MatchCheckinService } from './match-checkin.service'

export class MatchCheckinResponseDto {
  @ApiProperty() matchId!: string
  @ApiProperty({ minimum: 0 }) count!: number
  @ApiProperty() checkedIn!: boolean
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) checkedInAt!: string | null
}

@ApiTags('experience')
@Controller()
export class MatchCheckinController {
  constructor(@Inject(MatchCheckinService) private readonly checkins: MatchCheckinService) {}

  @Get('public/matches/:matchId/check-in')
  @ApiOkResponse({ type: MatchCheckinResponseDto })
  get(
    @Req() request: RequestWithId,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.checkins.get(getOrganizationId(request), matchId, authorization)
  }

  @Put('matches/:matchId/check-in')
  @ApiBearerAuth()
  @ApiOkResponse({ type: MatchCheckinResponseDto })
  checkIn(
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.checkins.checkIn(authorization, matchId)
  }
}
