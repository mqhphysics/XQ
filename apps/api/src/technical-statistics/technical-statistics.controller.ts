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
  Query,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags, ApiExtraModels } from '@nestjs/swagger'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import { getRequestId, type RequestWithId } from '../common/request-context'
import {
  RecordTechnicalStatisticsDto,
  TechnicalStatisticsResponseDto,
  TechnicalStatisticsQueryDto,
} from './technical-statistics.dto'
import { TechnicalStatisticsService } from './technical-statistics.service'
@ApiTags('technical-statistics')
@ApiExtraModels(TechnicalStatisticsQueryDto)
@ApiBearerAuth()
@AuthorizeInApplicationService()
@Controller('matches/:matchId/technical-statistics')
export class TechnicalStatisticsController {
  constructor(
    @Inject(TechnicalStatisticsService) private readonly service: TechnicalStatisticsService,
  ) {}
  @Get()
  @ApiOkResponse({ type: TechnicalStatisticsResponseDto })
  get(
    @Headers('authorization') auth: string | undefined,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Query() query: TechnicalStatisticsQueryDto,
  ) {
    return this.service.get(auth, matchId, query.schemaVersion)
  }
  @Post()
  @HttpCode(200)
  @ApiBody({ type: RecordTechnicalStatisticsDto })
  @ApiOkResponse({ type: TechnicalStatisticsResponseDto })
  record(
    @Headers('authorization') auth: string | undefined,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: RecordTechnicalStatisticsDto,
    @Req() req: RequestWithId,
  ) {
    return this.service.record(auth, matchId, body, getRequestId(req))
  }
}
