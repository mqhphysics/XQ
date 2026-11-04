import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiHeader, ApiTags } from '@nestjs/swagger'

import { AuthorizeInApplicationService } from '../auth/application-authorization'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { requireP1DevOrganizationId } from '../schedule/dev-context'
import { ProgressionConfirmDto, ProgressionPreviewDto } from './results.dto'
import { ResultsService } from './results.service'

@ApiTags('results')
@Controller()
export class ResultsController {
  constructor(@Inject(ResultsService) private readonly results: ResultsService) {}

  @Get('public/tournaments/:id/results')
  read(@Req() request: RequestWithId, @Param('id', ParseUUIDPipe) tournamentId: string) {
    return this.results.readTournamentResults(requireP1DevOrganizationId(request), tournamentId)
  }

  @Post('admin/tournaments/:id/progression/preview')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiBody({ type: ProgressionPreviewDto })
  @AuthorizeInApplicationService()
  preview(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) tournamentId: string,
    @Body() dto: ProgressionPreviewDto,
  ) {
    return this.results.preview(authorization, tournamentId, dto)
  }

  @Post('admin/tournaments/:id/progression/confirm')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: ProgressionConfirmDto })
  @AuthorizeInApplicationService()
  confirm(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) tournamentId: string,
    @Body() dto: ProgressionConfirmDto,
    @Req() request: RequestWithId,
  ) {
    return this.results.confirm(authorization, tournamentId, dto, key, getRequestId(request))
  }
}
