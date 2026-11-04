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
  Res,
} from '@nestjs/common'
import { ApiBearerAuth, ApiExtraModels, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { AdminPeopleService } from './admin-people.service'
import { AdminMediaService } from './admin-media.service'
import { AdminModerationService } from './admin-moderation.service'
import { AdminLoginAccessService } from './admin-login-access.service'
import {
  AdminCenterEditDto,
  AdminCenterPageDto,
  AdminSanctionDto,
  AdminMediaDecisionDto,
  AdminContentDecisionDto,
  AdminCenterReasonDto,
  AdminPasswordResetDto,
  AdminProvisionAccountsDto,
  AdminDirectMessageDecisionDto,
  AdminDirectMessagesQueryDto,
  AdminRegistrationFeedbackDecisionDto,
  AdminRegistrationFeedbackQueryDto,
  AdminSystemMessageDto,
} from './admin-center.dto'

@ApiTags('admin-governance')
@ApiBearerAuth()
@AuthorizeInApplicationService()
@ApiExtraModels(
  AdminCenterEditDto,
  AdminCenterPageDto,
  AdminSanctionDto,
  AdminMediaDecisionDto,
  AdminContentDecisionDto,
  AdminCenterReasonDto,
  AdminPasswordResetDto,
  AdminProvisionAccountsDto,
  AdminDirectMessageDecisionDto,
  AdminDirectMessagesQueryDto,
  AdminRegistrationFeedbackDecisionDto,
  AdminRegistrationFeedbackQueryDto,
)
@Controller('admin/center')
export class AdminGovernanceController {
  constructor(
    @Inject(AdminPeopleService) private readonly people: AdminPeopleService,
    @Inject(AdminMediaService) private readonly media: AdminMediaService,
    @Inject(AdminModerationService) private readonly moderation: AdminModerationService,
    @Inject(AdminLoginAccessService) private readonly loginAccess: AdminLoginAccessService,
  ) {}
  @Get('posts/:id/detail') postDetail(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.moderation.detail(auth, id)
  }
  @Post('system-notifications') notify(
    @Headers('authorization') auth: string | undefined,
    @Body() body: AdminSystemMessageDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithId,
  ) {
    return this.moderation.notify(auth, body, key, getRequestId(request))
  }
  @Get('registration-feedback') registrationFeedback(
    @Headers('authorization') auth: string | undefined,
    @Query() query: AdminRegistrationFeedbackQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'private, no-store')
    return this.moderation.registrationFeedback(auth, query)
  }
  @Post('registration-feedback/:id/decisions') resolveRegistrationFeedback(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminRegistrationFeedbackDecisionDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithId,
  ) {
    return this.moderation.resolveRegistrationFeedback(auth, id, body, key, getRequestId(request))
  }
  @Get('messages') messages(
    @Headers('authorization') auth: string | undefined,
    @Query() query: AdminDirectMessagesQueryDto,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('Vary', 'Authorization')
    return this.moderation.messages(auth, query, getRequestId(request))
  }
  @Post('messages/:id/decisions') messageDecision(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminDirectMessageDecisionDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'private, no-store')
    return this.moderation.messageDecision(auth, id, body, key, getRequestId(request))
  }
  @Post('users/provision-from-players') provision(
    @Headers('authorization') auth: string | undefined,
    @Body() body: AdminProvisionAccountsDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: RequestWithId,
  ) {
    return this.loginAccess.provision(auth, body, key, getRequestId(req))
  }

  @Get('users/:id/login-access') loginInformation(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'private, no-store')
    return this.loginAccess.view(auth, id)
  }

  @Post('users/:id/login-password') resetLoginPassword(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminPasswordResetDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: RequestWithId,
  ) {
    return this.loginAccess.reset(auth, id, body, key, getRequestId(req))
  }
  @Get('users/:id') detail(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.people.detail(auth, id)
  }
  @Patch('users/:id') edit(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminCenterEditDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() r: RequestWithId,
  ) {
    return this.people.edit(auth, id, body, key, getRequestId(r))
  }
  @Get('users/:id/activity') activity(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: AdminCenterPageDto,
  ) {
    return this.people.activity(auth, id, q)
  }
  @Post('users/:id/sanctions') sanction(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: AdminSanctionDto,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: RequestWithId,
  ) {
    return this.people.sanction(auth, id, b, k, getRequestId(r))
  }
  @Patch('players/:id/identity') identity(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: AdminCenterEditDto,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: RequestWithId,
  ) {
    return this.people.editPlayerIdentity(auth, id, b, k, getRequestId(r))
  }
  @Get('media/library') library(
    @Headers('authorization') auth: string | undefined,
    @Query() q: AdminCenterPageDto,
  ) {
    return this.media.list(auth, q)
  }
  @Get('media/preview') async preview(
    @Headers('authorization') auth: string | undefined,
    @Query('url') url: string,
    @Res() res: Response,
  ) {
    const image = await this.media.preview(auth, url)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.type(image.mimeType).send(image.body)
  }
  @Post('media/decisions') mediaDecision(
    @Headers('authorization') auth: string | undefined,
    @Body() b: AdminMediaDecisionDto,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: RequestWithId,
  ) {
    return this.media.decision(auth, b, k, getRequestId(r))
  }
  @Post('posts/:id/decisions') decision(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: AdminContentDecisionDto,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: RequestWithId,
  ) {
    return this.moderation.decision(auth, id, b, k, getRequestId(r))
  }
  @Get('moderation/capabilities') capabilities(@Headers('authorization') auth: string | undefined) {
    return this.moderation.capabilities(auth)
  }
  @Post('posts/:id/ai-review') aiPost(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: AdminCenterReasonDto,
  ) {
    return this.moderation.ai(auth, 'POST', id, b)
  }
  @Post('media/ai-review') aiMedia(
    @Headers('authorization') auth: string | undefined,
    @Query('url') url: string,
    @Body() b: AdminCenterReasonDto,
  ) {
    return this.moderation.ai(auth, 'MEDIA', url, b)
  }
}
