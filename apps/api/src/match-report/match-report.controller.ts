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
  Query,
  Req,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import {
  ReportHistoryQueryDto,
  ReportHistoryResponseDto,
  ReportWorkspaceResponseDto,
  WriteMatchReportDto,
  BeginMatchReportDto,
  RequestMatchReportChangeDto,
  ReportOverviewResponseDto,
} from './match-report.dto'
import { MatchReportService } from './match-report.service'

@ApiTags('match-report')
@ApiExtraModels(ReportHistoryQueryDto)
@ApiBearerAuth()
@Controller('matches/:matchId/report')
@AuthorizeInApplicationService()
export class MatchReportController {
  constructor(@Inject(MatchReportService) private readonly reports: MatchReportService) {}

  @Post('editor')
  @HttpCode(200)
  @ApiBody({ type: BeginMatchReportDto })
  begin(
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: BeginMatchReportDto,
    @Req() request: RequestWithId,
  ) {
    return this.reports.begin(authorization, matchId, body.clientActionId, getRequestId(request))
  }

  @Post('change-requests')
  @HttpCode(200)
  @ApiBody({ type: RequestMatchReportChangeDto })
  requestChange(
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: RequestMatchReportChangeDto,
    @Req() request: RequestWithId,
  ) {
    return this.reports.requestChange(authorization, matchId, body, getRequestId(request))
  }

  @Get()
  @ApiOkResponse({ type: ReportWorkspaceResponseDto })
  @ApiOperation({ summary: '读取授权比赛的报告、固定名单/规程版本和可用操作' })
  get(
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.reports.get(authorization, matchId)
  }

  @Get('history')
  @ApiOkResponse({ type: ReportHistoryResponseDto })
  @ApiOperation({ summary: '按不可变版本降序读取报告历史，不返回未保存草稿' })
  history(
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Query() query: ReportHistoryQueryDto,
  ) {
    return this.reports.history(authorization, matchId, query)
  }

  @Post()
  @HttpCode(200)
  @ApiOkResponse({ type: ReportWorkspaceResponseDto })
  @ApiOperation({ summary: '按期望版本幂等保存、提交、审核或启动结果修正' })
  @ApiBody({ type: WriteMatchReportDto })
  write(
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: WriteMatchReportDto,
    @Req() request: RequestWithId,
  ) {
    return this.reports.write(authorization, matchId, body, getRequestId(request))
  }
}

@ApiTags('match-report')
@ApiBearerAuth()
@Controller('match-reports')
@AuthorizeInApplicationService()
export class MatchReportOverviewController {
  constructor(@Inject(MatchReportService) private readonly reports: MatchReportService) {}

  @Get('overview')
  @ApiOkResponse({ type: ReportOverviewResponseDto })
  @ApiOperation({ summary: '比赛录入列表：授权比赛的录入状态与已录比分' })
  overview(
    @Headers('authorization') authorization: string | undefined,
    @Query('tournamentId', ParseUUIDPipe) tournamentId: string,
  ) {
    return this.reports.overview(authorization, tournamentId)
  }
}
