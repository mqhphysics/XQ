import { randomUUID } from 'node:crypto'
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { RequestWithId } from '../common/request-context'
import { LineupPlanCommandDto, SaveLineupPlanDto } from './lineup-plan.dto'
import { LineupPlanService } from './lineup-plan.service'
import { AuthorizeInApplicationService } from '../auth/application-authorization'

@ApiTags('captain-lineup-plans')
@AuthorizeInApplicationService()
@ApiBearerAuth()
@Controller('captain/teams/:teamId/lineup-plans')
export class LineupPlanController {
  constructor(@Inject(LineupPlanService) private readonly service: LineupPlanService) {}
  @Get()
  @ApiOperation({ summary: '读取本队云端战术和单场阵容计划' })
  list(
    @Headers('authorization') authorization: string | undefined,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ) {
    return this.service.list(authorization, teamId)
  }
  @Get(':planId/revisions')
  @ApiOperation({ summary: '读取本队计划的不可变保存历史' })
  history(
    @Headers('authorization') authorization: string | undefined,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Query('beforeVersion', new ParseIntPipe({ optional: true })) beforeVersion?: number,
  ) {
    return this.service.history(authorization, teamId, planId, beforeVersion)
  }
  @Post()
  @ApiBody({ type: SaveLineupPlanDto })
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: '幂等保存战术或单场阵容，校验版本并新增不可变历史' })
  save(
    @Headers('authorization') authorization: string | undefined,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SaveLineupPlanDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.save(authorization, teamId, input, key, request.requestId ?? randomUUID())
  }

  @Post(':planId/default')
  @ApiBody({ type: LineupPlanCommandDto })
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: '将全队战术设为默认阵容，不生成单场首发' })
  setDefault(
    @Headers('authorization') authorization: string | undefined,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: LineupPlanCommandDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.publish(
      authorization,
      teamId,
      planId,
      'DEFAULT',
      input,
      key,
      request.requestId ?? randomUUID(),
    )
  }

  @Post(':planId/confirm')
  @ApiBody({ type: LineupPlanCommandDto })
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: '显式确认本场八人首发，发布当前不可变版本' })
  confirm(
    @Headers('authorization') authorization: string | undefined,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: LineupPlanCommandDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.publish(
      authorization,
      teamId,
      planId,
      'CONFIRM',
      input,
      key,
      request.requestId ?? randomUUID(),
    )
  }
}
