import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  HttpCode,
} from '@nestjs/common'
import { ApiBearerAuth, ApiExtraModels, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import { getRequestId, type RequestWithId } from '../common/request-context'
import {
  AdminCenterAuditQueryDto,
  AdminCenterCreatePostDto,
  AdminCenterCreateTeamDto,
  AdminCenterCreatePlayerDto,
  AdminCenterEditDto,
  AdminCenterMembershipDto,
  AdminCenterPageDto,
  AdminCenterReasonDto,
  AdminCenterRuleVersionDto,
  AdminCenterUsersQueryDto,
  AdminCenterPostsQueryDto,
  AdminOverviewResponseDto,
} from './admin-center.dto'
import { AdminCenterService } from './admin-center.service'

@ApiTags('admin-center')
@ApiBearerAuth()
@ApiExtraModels(
  AdminCenterAuditQueryDto,
  AdminCenterCreatePostDto,
  AdminCenterCreateTeamDto,
  AdminCenterCreatePlayerDto,
  AdminCenterEditDto,
  AdminCenterMembershipDto,
  AdminCenterPageDto,
  AdminCenterReasonDto,
  AdminCenterRuleVersionDto,
  AdminCenterUsersQueryDto,
  AdminCenterPostsQueryDto,
)
@AuthorizeInApplicationService()
@Controller('admin/center')
export class AdminCenterController {
  constructor(@Inject(AdminCenterService) private readonly center: AdminCenterService) {}

  @Get('overview')
  @ApiOkResponse({
    type: AdminOverviewResponseDto,
    description: '本组织真实待办、资料数量及最近管理操作；不返回凭据或审计敏感明细',
  })
  overview(@Headers('authorization') auth: string | undefined) {
    return this.center.overview(auth)
  }

  @Get('users')
  users(
    @Headers('authorization') auth: string | undefined,
    @Query() query: AdminCenterUsersQueryDto,
  ) {
    return this.center.users(auth, query)
  }

  @Post('users/:id/membership')
  @HttpCode(200)
  membership(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminCenterMembershipDto,
    @Req() req: RequestWithId,
  ) {
    return this.center.membership(auth, id, body, key, getRequestId(req))
  }

  @Post('users/:id/revoke-sessions')
  @HttpCode(200)
  revoke(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminCenterReasonDto,
    @Req() req: RequestWithId,
  ) {
    return this.center.revokeSessions(auth, id, body, key, getRequestId(req))
  }

  @Get('teams')
  teams(@Headers('authorization') auth: string | undefined, @Query() query: AdminCenterPageDto) {
    return this.center.teams(auth, query)
  }

  @Get('players')
  players(@Headers('authorization') auth: string | undefined, @Query() query: AdminCenterPageDto) {
    return this.center.players(auth, query)
  }

  @Post('teams')
  @HttpCode(200)
  createTeam(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: AdminCenterCreateTeamDto,
    @Req() req: RequestWithId,
  ) {
    return this.center.createTeam(auth, body, key, getRequestId(req))
  }

  @Post('players')
  @HttpCode(200)
  createPlayer(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: AdminCenterCreatePlayerDto,
    @Req() req: RequestWithId,
  ) {
    return this.center.createPlayer(auth, body, key, getRequestId(req))
  }

  @Patch('teams/:id')
  team(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminCenterEditDto,
    @Req() req: RequestWithId,
  ) {
    return this.center.edit(auth, 'Team', id, body, key, getRequestId(req))
  }

  @Patch('players/:id')
  player(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminCenterEditDto,
    @Req() req: RequestWithId,
  ) {
    return this.center.edit(auth, 'PlayerProfile', id, body, key, getRequestId(req))
  }

  @Get('audit')
  audit(
    @Headers('authorization') auth: string | undefined,
    @Query() query: AdminCenterAuditQueryDto,
  ) {
    return this.center.audit(auth, query)
  }

  @Get('media')
  media(@Headers('authorization') auth: string | undefined, @Query() query: AdminCenterPageDto) {
    return this.center.media(auth, query)
  }

  @Get('system')
  system(@Headers('authorization') auth: string | undefined) {
    return this.center.system(auth)
  }

  @Get('posts')
  posts(
    @Headers('authorization') auth: string | undefined,
    @Query() query: AdminCenterPostsQueryDto,
  ) {
    return this.center.posts(auth, query)
  }

  @Post('posts')
  @HttpCode(200)
  createPost(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: AdminCenterCreatePostDto,
    @Req() req: RequestWithId,
  ) {
    return this.center.createPost(auth, body, key, getRequestId(req))
  }

  @Patch('posts/:id')
  post(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminCenterEditDto,
    @Req() req: RequestWithId,
  ) {
    return this.center.editPost(auth, id, body, key, getRequestId(req))
  }

  @Post('tournaments/:id/rule-versions')
  @HttpCode(200)
  ruleVersion(
    @Headers('authorization') auth: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminCenterRuleVersionDto,
    @Req() req: RequestWithId,
  ) {
    return this.center.createRuleVersion(auth, id, body, key, getRequestId(req))
  }
}
