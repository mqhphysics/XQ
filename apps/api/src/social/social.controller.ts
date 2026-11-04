import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger'

import { getRequestId, type RequestWithId } from '../common/request-context'
import { MessagingService } from './messaging.service'
import { BadgePreferenceService } from './badge-preference.service'
import { HubStripOrderService } from './hub-strip-order.service'
import {
  CreateDirectMessageDto,
  CreateReportDto,
  CreateTeamApplicationDto,
  ReviewReportDto,
  ReviewTeamApplicationDto,
  UpdateTeamMemberDto,
  UpdateTeamProfileDto,
  TeamManagementCommandDto,
  UpdateBadgePreferenceDto,
  UpdateHubStripOrderDto,
} from './social.dto'
import { SocialService } from './social.service'

@ApiTags('social')
@ApiBearerAuth()
@Controller()
export class SocialController {
  constructor(
    @Inject(SocialService) private readonly socialService: SocialService,
    @Inject(MessagingService) private readonly messagingService: MessagingService,
    @Inject(BadgePreferenceService) private readonly badgePreference: BadgePreferenceService,
    @Inject(HubStripOrderService) private readonly hubStripOrder: HubStripOrderService,
  ) {}

  @Get('me/profile-badge')
  @ApiOperation({ summary: '读取自己的展示标志及可选有效身份' })
  profileBadge(@Headers('authorization') authorization: string | undefined) {
    return this.badgePreference.get(authorization)
  }

  @Put('me/profile-badge')
  @ApiOperation({ summary: '更换自己的展示标志，不改变身份权限' })
  @ApiBody({ type: UpdateBadgePreferenceDto })
  updateProfileBadge(
    @Headers('authorization') authorization: string | undefined,
    @Body() input: UpdateBadgePreferenceDto,
    @Req() request: RequestWithId,
  ) {
    return this.badgePreference.update(authorization, input, getRequestId(request))
  }

  @Get('me/hub-strip-order')
  @ApiOperation({ summary: '读取主队条关注球队与球员的排列顺序' })
  hubStripOrderGet(@Headers('authorization') authorization: string | undefined) {
    return this.hubStripOrder.get(authorization)
  }

  @Put('me/hub-strip-order')
  @ApiOperation({ summary: '保存主队条关注排列，主队固定最前且不写入本列表' })
  @ApiBody({ type: UpdateHubStripOrderDto })
  hubStripOrderPut(
    @Headers('authorization') authorization: string | undefined,
    @Body() input: UpdateHubStripOrderDto,
    @Req() request: RequestWithId,
  ) {
    return this.hubStripOrder.update(authorization, input, getRequestId(request))
  }

  @Get('me/player-follows')
  @ApiOperation({ summary: '读取当前用户关注的球员' })
  playerFollows(@Headers('authorization') authorization: string | undefined) {
    return this.socialService.listPlayerFollows(authorization)
  }

  @Put('me/player-follows/:playerId')
  @ApiOperation({ summary: '关注球员' })
  followPlayer(
    @Headers('authorization') authorization: string | undefined,
    @Param('playerId') playerId: string,
  ) {
    return this.socialService.followPlayer(authorization, playerId)
  }

  @Delete('me/player-follows/:playerId')
  @ApiOperation({ summary: '取消关注球员' })
  unfollowPlayer(
    @Headers('authorization') authorization: string | undefined,
    @Param('playerId') playerId: string,
  ) {
    return this.socialService.unfollowPlayer(authorization, playerId)
  }

  @Get('teams/:teamId/relationship')
  @ApiOperation({ summary: '读取本人和球队的成员/申请关系' })
  teamRelationship(
    @Headers('authorization') authorization: string | undefined,
    @Param('teamId') teamId: string,
  ) {
    return this.socialService.getTeamRelationship(authorization, teamId)
  }

  @Post('teams/:teamId/join-applications')
  @ApiOperation({ summary: '提交入队申请' })
  @ApiBody({ type: CreateTeamApplicationDto })
  applyToTeam(
    @Headers('authorization') authorization: string | undefined,
    @Param('teamId') teamId: string,
    @Body() body: CreateTeamApplicationDto,
  ) {
    return this.socialService.applyToTeam(authorization, teamId, body)
  }

  @Get('captain/teams/:teamId')
  @ApiOperation({ summary: '读取队长管理台、成员和入队申请' })
  captainWorkspace(
    @Headers('authorization') authorization: string | undefined,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ) {
    return this.socialService.getCaptainWorkspace(authorization, teamId)
  }

  @Put('captain/teams/:teamId/profile')
  @ApiOperation({ summary: '保存本队公开资料，不改变赛事报名或历史名单' })
  @ApiBody({ type: UpdateTeamProfileDto })
  updateTeamProfile(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() body: UpdateTeamProfileDto,
    @Req() request: RequestWithId,
  ) {
    return this.socialService.updateTeamProfile(
      authorization,
      teamId,
      body,
      getRequestId(request),
      key,
    )
  }

  @Put('captain/teams/:teamId/applications/:applicationId')
  @ApiOperation({ summary: '批准或拒绝入队申请' })
  @ApiBody({ type: ReviewTeamApplicationDto })
  reviewApplication(
    @Headers('authorization') authorization: string | undefined,
    @Param('teamId') teamId: string,
    @Param('applicationId') applicationId: string,
    @Body() body: ReviewTeamApplicationDto,
    @Req() request: RequestWithId,
  ) {
    return this.socialService.reviewTeamApplication(
      authorization,
      teamId,
      applicationId,
      body,
      getRequestId(request),
    )
  }

  @Put('captain/teams/:teamId/members/:membershipId')
  @ApiOperation({ summary: '调整球队成员位置' })
  @ApiBody({ type: UpdateTeamMemberDto })
  updateMember(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() body: UpdateTeamMemberDto,
    @Req() request: RequestWithId,
  ) {
    return this.socialService.updateTeamMember(
      authorization,
      teamId,
      membershipId,
      body,
      getRequestId(request),
      key,
    )
  }

  @Delete('captain/teams/:teamId/members/:membershipId')
  @ApiOperation({ summary: '将成员移出球队' })
  @ApiBody({ type: TeamManagementCommandDto })
  removeMember(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() body: TeamManagementCommandDto,
    @Req() request: RequestWithId,
  ) {
    return this.socialService.removeTeamMember(
      authorization,
      teamId,
      membershipId,
      getRequestId(request),
      body,
      key,
    )
  }

  @Get('me/notifications')
  @ApiOperation({ summary: '读取点赞、回复、申请、投诉和私信通知' })
  notifications(@Headers('authorization') authorization: string | undefined) {
    return this.socialService.listNotifications(authorization)
  }

  @Put('me/notifications/read-all')
  @ApiOperation({ summary: '全部标记已读' })
  readAllNotifications(@Headers('authorization') authorization: string | undefined) {
    return this.socialService.markAllNotificationsRead(authorization)
  }

  @Put('me/notifications/:notificationId/read')
  @ApiOperation({ summary: '标记一条通知已读' })
  readNotification(
    @Headers('authorization') authorization: string | undefined,
    @Param('notificationId') notificationId: string,
  ) {
    return this.socialService.markNotificationRead(authorization, notificationId)
  }

  @Post('reports')
  @ApiOperation({ summary: '提交投诉或问题反馈' })
  @ApiBody({ type: CreateReportDto })
  createReport(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateReportDto,
  ) {
    return this.socialService.createReport(authorization, body)
  }

  @Get('me/reports')
  @ApiOperation({ summary: '读取本人投诉与处理结果' })
  myReports(@Headers('authorization') authorization: string | undefined) {
    return this.socialService.listMyReports(authorization)
  }

  @Get('admin/reports')
  @ApiOperation({ summary: '管理员读取投诉处理台' })
  adminReports(@Headers('authorization') authorization: string | undefined) {
    return this.socialService.listAdminReports(authorization)
  }

  @Put('admin/reports/:reportId')
  @ApiOperation({ summary: '管理员处理投诉并回复提交者' })
  @ApiBody({ type: ReviewReportDto })
  reviewReport(
    @Headers('authorization') authorization: string | undefined,
    @Param('reportId') reportId: string,
    @Body() body: ReviewReportDto,
    @Req() request: RequestWithId,
  ) {
    return this.socialService.reviewReport(authorization, reportId, body, getRequestId(request))
  }

  @Get('messages/directory')
  @ApiOperation({ summary: '读取或搜索当前组织可私信用户' })
  messageDirectory(
    @Headers('authorization') authorization: string | undefined,
    @Query('query') query: string | undefined,
  ) {
    return this.messagingService.listDirectory(authorization, query)
  }

  @Get('messages/conversations')
  @ApiOperation({ summary: '读取私信会话' })
  conversations(@Headers('authorization') authorization: string | undefined) {
    return this.messagingService.listConversations(authorization)
  }

  @Get('messages/conversations/:conversationId')
  @ApiOperation({ summary: '读取私信消息' })
  messages(
    @Headers('authorization') authorization: string | undefined,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.listMessages(authorization, conversationId)
  }

  @Put('messages/conversations/:conversationId/read')
  @ApiOperation({ summary: '标记会话已读' })
  readConversation(
    @Headers('authorization') authorization: string | undefined,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.markConversationRead(authorization, conversationId)
  }

  @Post('messages/direct/:recipientUserId')
  @ApiOperation({ summary: '向同组织用户发送幂等私信' })
  @ApiBody({ type: CreateDirectMessageDto })
  sendMessage(
    @Headers('authorization') authorization: string | undefined,
    @Param('recipientUserId') recipientUserId: string,
    @Body() body: CreateDirectMessageDto,
  ) {
    return this.messagingService.sendMessage(authorization, recipientUserId, body)
  }
}
