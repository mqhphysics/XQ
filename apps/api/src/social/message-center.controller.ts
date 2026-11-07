import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { getRequestId, type RequestWithId } from '../common/request-context'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiExtraModels,
} from '@nestjs/swagger'
import { MessageCenterService } from './message-center.service'
import {
  BlockedUserListDto,
  MessageCenterNotificationPageDto,
  MessageCenterQueryDto,
  MessagePreferencesDto,
  MessageSummaryDto,
  UpdateMessagePreferencesDto,
  UserBlockStateDto,
} from './message-center.dto'

@ApiTags('message-center')
@ApiBearerAuth()
@ApiExtraModels(MessageCenterQueryDto)
@Controller()
export class MessageCenterController {
  constructor(@Inject(MessageCenterService) private readonly service: MessageCenterService) {}

  @Get('me/message-center/summary')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: MessageSummaryDto })
  @ApiOperation({ summary: '读取私信和通知分类未读；私信不重复计算通知副本' })
  summary(@Headers('authorization') authorization?: string) {
    return this.service.summary(authorization)
  }

  @Get('me/message-center/notifications')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: MessageCenterNotificationPageDto })
  notifications(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: MessageCenterQueryDto,
  ) {
    return this.service.notifications(authorization, query.category, query.before)
  }

  @Put('me/message-center/groups/:id/read')
  @ApiOkResponse({ type: MessageSummaryDto })
  readGroup(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.readGroup(authorization, id)
  }

  @Put('me/message-center/read-all')
  @ApiOkResponse({ type: MessageSummaryDto })
  readAll(@Headers('authorization') authorization?: string) {
    return this.service.readAll(authorization)
  }

  @Get('me/message-preferences')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: MessagePreferencesDto })
  preferences(@Headers('authorization') authorization?: string) {
    return this.service.preferences(authorization)
  }

  @Put('me/message-preferences')
  @ApiBody({ type: UpdateMessagePreferencesDto })
  @ApiOkResponse({ type: MessagePreferencesDto })
  updatePreferences(
    @Headers('authorization') authorization: string | undefined,
    @Body() input: UpdateMessagePreferencesDto,
  ) {
    return this.service.updatePreferences(authorization, input)
  }

  @Get('me/blocked-users')
  @ApiOkResponse({ type: BlockedUserListDto })
  blocks(@Headers('authorization') authorization?: string) {
    return this.service.blocks(authorization)
  }

  @Put('me/blocked-users/:id')
  @ApiOkResponse({ type: UserBlockStateDto })
  block(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithId,
  ) {
    return this.service.setBlock(authorization, id, true, getRequestId(request))
  }

  @Delete('me/blocked-users/:id')
  @ApiOkResponse({ type: UserBlockStateDto })
  unblock(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestWithId,
  ) {
    return this.service.setBlock(authorization, id, false, getRequestId(request))
  }
}
