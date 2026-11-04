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
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger'
import { randomUUID } from 'node:crypto'

import type { RequestWithId } from '../common/request-context'
import { RosterWorkflowCommandDto } from './roster-workflow.dto'
import { RosterWorkflowService } from './roster-workflow.service'
import { AuthorizeInApplicationService } from '../auth/application-authorization'

@ApiTags('roster-workflow')
@AuthorizeInApplicationService()
@ApiBearerAuth()
@Controller('roster/tournaments/:tournamentId/teams/:teamId')
export class RosterWorkflowController {
  constructor(@Inject(RosterWorkflowService) private readonly service: RosterWorkflowService) {}

  @Get()
  @ApiOperation({ summary: '读取本人获授权球队的赛事名单工作台' })
  read(
    @Headers('authorization') authorization: string | undefined,
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ) {
    return this.service.read(authorization, tournamentId, teamId)
  }

  @Post('commands')
  @ApiBody({ type: RosterWorkflowCommandDto })
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: '编辑、提交、退回、批准、锁定或开放补报名单' })
  execute(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() command: RosterWorkflowCommandDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.execute(
      authorization,
      tournamentId,
      teamId,
      command,
      key,
      request.requestId ?? randomUUID(),
    )
  }
}
