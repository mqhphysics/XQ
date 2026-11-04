import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common'
import {
  ApiBody,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'

import { ApiErrorResponseDto } from '../common/api-error-response.dto'
import type { RequestWithId } from '../common/request-context'
import { requireP1DevAdminContext, requireP1DevOrganizationId } from './dev-context'
import {
  AdminScheduleWorkbenchResponseDto,
  CompetitionRuleVersionResponseDto,
  CreateCompetitionRuleVersionDto,
  CreateMatchDto,
  CreateSchedulePlanDto,
  CreateSeasonDto,
  CreateTeamDto,
  CreateTournamentDto,
  CreateVenueDto,
  MatchResponseDto,
  PublicTournamentListResponseDto,
  SchedulePlanResponseDto,
  ScheduleRevisionResponseDto,
  SeasonResponseDto,
  TeamResponseDto,
  TournamentDetailResponseDto,
  TournamentResponseDto,
  TournamentScheduleResponseDto,
  VenueResponseDto,
} from './schedule.dto'
import { ScheduleService } from './schedule.service'

@ApiTags('schedule')
@Controller()
export class ScheduleController {
  constructor(@Inject(ScheduleService) private readonly scheduleService: ScheduleService) {}

  @Get('admin/schedule-workbench')
  @P1AdminHeaders()
  @ApiOperation({ summary: '读取后台赛程工作台快照' })
  @ApiOkResponse({ type: AdminScheduleWorkbenchResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  getAdminScheduleWorkbench(@Req() request: RequestWithId) {
    const context = requireP1DevAdminContext(request)
    return this.scheduleService.getAdminScheduleWorkbench(
      context.organizationId,
      request.administeredTournamentIds ?? null,
    )
  }

  @Post('admin/seasons')
  @P1AdminHeaders()
  @ApiOperation({ summary: '创建赛季' })
  @ApiBody({ type: CreateSeasonDto })
  @ApiCreatedResponse({ type: SeasonResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  createSeason(@Req() request: RequestWithId, @Body() body: CreateSeasonDto) {
    const context = requireP1DevAdminContext(request)
    return this.scheduleService.createSeason(context.organizationId, body)
  }

  @Post('admin/tournaments')
  @P1AdminHeaders()
  @ApiOperation({ summary: '创建赛事' })
  @ApiBody({ type: CreateTournamentDto })
  @ApiCreatedResponse({ type: TournamentResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  createTournament(@Req() request: RequestWithId, @Body() body: CreateTournamentDto) {
    const context = requireP1DevAdminContext(request)
    return this.scheduleService.createTournament(context.organizationId, body)
  }

  @Post('admin/tournaments/:id/rule-versions')
  @P1AdminHeaders()
  @ApiOperation({ summary: '创建赛事规则版本' })
  @ApiBody({ type: CreateCompetitionRuleVersionDto })
  @ApiCreatedResponse({ type: CompetitionRuleVersionResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  createRuleVersion(
    @Req() request: RequestWithId,
    @Param('id') tournamentId: string,
    @Body() body: CreateCompetitionRuleVersionDto,
  ) {
    const context = requireP1DevAdminContext(request)
    return this.scheduleService.createRuleVersion(context.organizationId, tournamentId, body)
  }

  @Post('admin/tournaments/:id/teams')
  @P1AdminHeaders()
  @ApiOperation({ summary: '创建球队' })
  @ApiBody({ type: CreateTeamDto })
  @ApiCreatedResponse({ type: TeamResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  createTeam(
    @Req() request: RequestWithId,
    @Param('id') tournamentId: string,
    @Body() body: CreateTeamDto,
  ) {
    const context = requireP1DevAdminContext(request)
    return this.scheduleService.createTeam(context.organizationId, tournamentId, body)
  }

  @Post('admin/venues')
  @P1AdminHeaders()
  @ApiOperation({ summary: '创建场地' })
  @ApiBody({ type: CreateVenueDto })
  @ApiCreatedResponse({ type: VenueResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  createVenue(@Req() request: RequestWithId, @Body() body: CreateVenueDto) {
    const context = requireP1DevAdminContext(request)
    return this.scheduleService.createVenue(context.organizationId, body)
  }

  @Post('admin/tournaments/:id/matches')
  @P1AdminHeaders()
  @ApiOperation({ summary: '创建比赛草案' })
  @ApiBody({ type: CreateMatchDto })
  @ApiCreatedResponse({ type: MatchResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  createMatch(
    @Req() request: RequestWithId,
    @Param('id') tournamentId: string,
    @Body() body: CreateMatchDto,
  ) {
    const context = requireP1DevAdminContext(request)
    return this.scheduleService.createMatch(context.organizationId, tournamentId, body)
  }

  @Post('admin/schedule-plans')
  @P1AdminHeaders()
  @ApiOperation({ summary: '创建赛程草案' })
  @ApiBody({ type: CreateSchedulePlanDto })
  @ApiCreatedResponse({ type: SchedulePlanResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  createSchedulePlan(@Req() request: RequestWithId, @Body() body: CreateSchedulePlanDto) {
    const context = requireP1DevAdminContext(request)
    return this.scheduleService.createSchedulePlan(context.organizationId, body)
  }

  @Post('admin/schedule-plans/:id/validate')
  @HttpCode(200)
  @P1AdminHeaders()
  @ApiOperation({ summary: '校验赛程草案' })
  @ApiOkResponse({ type: SchedulePlanResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  validateSchedulePlan(@Req() request: RequestWithId, @Param('id') schedulePlanId: string) {
    const context = requireP1DevAdminContext(request)
    return this.scheduleService.validateSchedulePlan(context.organizationId, schedulePlanId)
  }

  @Post('admin/schedule-plans/:id/publish')
  @P1AdminHeaders()
  @ApiOperation({ summary: '发布赛程草案' })
  @ApiCreatedResponse({ type: ScheduleRevisionResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  publishSchedulePlan(@Req() request: RequestWithId, @Param('id') schedulePlanId: string) {
    const context = requireP1DevAdminContext(request)
    return this.scheduleService.publishSchedulePlan(context.organizationId, schedulePlanId, request)
  }

  @Get('public/tournaments')
  @P1PublicHeaders()
  @ApiOperation({ summary: '读取已发布赛事列表' })
  @ApiOkResponse({ type: PublicTournamentListResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  listPublicTournaments(
    @Req() request: RequestWithId,
    @Query('competitionId') competitionDefinitionId: string | undefined,
    @Query('seasonId') seasonId: string | undefined,
  ) {
    return this.scheduleService.listPublicTournaments(
      requireP1DevOrganizationId(request),
      competitionDefinitionId || seasonId ? { competitionDefinitionId, seasonId } : undefined,
    )
  }

  @Get('public/tournaments/:id')
  @P1PublicHeaders()
  @ApiOperation({ summary: '读取已发布赛事详情' })
  @ApiOkResponse({ type: TournamentDetailResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getPublicTournament(@Req() request: RequestWithId, @Param('id') tournamentId: string) {
    return this.scheduleService.getPublicTournament(
      requireP1DevOrganizationId(request),
      tournamentId,
    )
  }

  @Get('public/tournaments/:id/schedule')
  @P1PublicHeaders()
  @ApiOperation({ summary: '读取已发布赛程' })
  @ApiOkResponse({ type: TournamentScheduleResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getPublicSchedule(@Req() request: RequestWithId, @Param('id') tournamentId: string) {
    return this.scheduleService.getPublicSchedule(requireP1DevOrganizationId(request), tournamentId)
  }

  @Get('public/matches/:id')
  @P1PublicHeaders()
  @ApiOperation({ summary: '读取已发布比赛详情' })
  @ApiOkResponse({ type: MatchResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getPublicMatch(@Req() request: RequestWithId, @Param('id') matchId: string) {
    return this.scheduleService.getPublicMatch(requireP1DevOrganizationId(request), matchId)
  }

  @Get('public/teams/:id')
  @P1PublicHeaders()
  @ApiOperation({ summary: '读取球队详情' })
  @ApiOkResponse({ type: TeamResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getPublicTeam(@Req() request: RequestWithId, @Param('id') teamId: string) {
    return this.scheduleService.getPublicTeam(requireP1DevOrganizationId(request), teamId)
  }
}

function P1AdminHeaders(): MethodDecorator {
  return ApiBearerAuth()
}

function P1PublicHeaders(): MethodDecorator {
  return ApiHeader({
    name: 'x-organization-id',
    description: '组织 UUID；登录后默认使用会话组织，游客可使用部署默认组织',
    required: false,
  })
}
