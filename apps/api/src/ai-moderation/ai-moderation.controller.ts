import {
  Header,
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Headers,
  Param,
  ParseUUIDPipe,
  Inject,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthService } from '../auth/auth.service'
import { AccessPolicyService } from '../auth/access-policy.service'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import { AiModerationService } from './ai-moderation.service'
import {
  AiModerationConfigDto,
  AiModerationDecisionDto,
  AiProviderDto,
  AiRulesDto,
} from './ai-moderation.dto'
@ApiTags('ai-moderation')
@ApiBearerAuth()
@AuthorizeInApplicationService()
@Controller('admin/ai-review')
export class AiModerationController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessPolicyService) private readonly policy: AccessPolicyService,
    @Inject(AiModerationService) private readonly service: AiModerationService,
  ) {}
  private async actor(token: string | undefined) {
    const actor = await this.auth.requireSession(token)
    this.policy.requireOrganizationAdministrator(actor)
    return actor
  }
  @Get('config') @Header('Cache-Control', 'private, no-store') async config(
    @Headers('authorization') token: string | undefined,
  ) {
    return this.service.config((await this.actor(token)).organizationId)
  }
  @Patch('config') async save(
    @Headers('authorization') token: string | undefined,
    @Body() body: AiModerationConfigDto,
  ) {
    const actor = await this.actor(token)
    return this.service.save(actor.organizationId, actor.userId, body)
  }
  @Post('test') async test(@Headers('authorization') token: string | undefined) {
    return this.service.test((await this.actor(token)).organizationId)
  }
  @Get('providers') @Header('Cache-Control', 'private, no-store') async providers(
    @Headers('authorization') token: string | undefined,
  ) {
    return this.service.providers((await this.actor(token)).organizationId)
  }
  @Post('providers') async saveProvider(
    @Headers('authorization') token: string | undefined,
    @Body() body: AiProviderDto,
  ) {
    const actor = await this.actor(token)
    return this.service.saveProvider(actor.organizationId, actor.userId, body)
  }
  @Post('providers/test') async testProvider(
    @Headers('authorization') token: string | undefined,
    @Body() body: AiProviderDto,
  ) {
    return this.service.testProvider((await this.actor(token)).organizationId, body)
  }
  @Post('providers/:id/activate') async activateProvider(
    @Headers('authorization') token: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = await this.actor(token)
    return this.service.activateProvider(actor.organizationId, actor.userId, id)
  }
  @Patch('rules') async saveRules(
    @Headers('authorization') token: string | undefined,
    @Body() body: AiRulesDto,
  ) {
    const actor = await this.actor(token)
    return this.service.saveRules(actor.organizationId, actor.userId, body)
  }
  @Get('stats') @Header('Cache-Control', 'private, no-store') async stats(
    @Headers('authorization') token: string | undefined,
  ) {
    return this.service.stats((await this.actor(token)).organizationId)
  }
  @Get('jobs') @Header('Cache-Control', 'private, no-store') async jobs(
    @Headers('authorization') token: string | undefined,
  ) {
    return this.service.list((await this.actor(token)).organizationId)
  }
  @Post('jobs/:id/retry') async retry(
    @Headers('authorization') token: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.retry((await this.actor(token)).organizationId, id)
  }
  @Post('jobs/:id/decision') async decision(
    @Headers('authorization') token: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AiModerationDecisionDto,
  ) {
    const actor = await this.actor(token)
    return this.service.human(actor.organizationId, actor.userId, id, body.decision, body.reason)
  }
}
