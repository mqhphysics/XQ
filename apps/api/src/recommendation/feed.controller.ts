import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { getOrganizationId, type RequestWithId } from '../common/request-context'
import { FeedService } from './feed.service'
import { FeedEventsDto, FeedEventsResponseDto, FeedQueryDto, FeedResponseDto } from './feed.dto'
@ApiTags('recommendation')
@Controller()
export class FeedController {
  constructor(@Inject(FeedService) private readonly feed: FeedService) {}
  @Get('public/feed')
  @Header('Cache-Control', 'private, no-store')
  @ApiHeader({ name: 'X-Organization-Id', required: true })
  @ApiOkResponse({ type: FeedResponseDto })
  get(
    @Req() req: RequestWithId,
    @Headers('authorization') auth: string | undefined,
    @Query() query: FeedQueryDto,
  ) {
    return this.feed.get(getOrganizationId(req), auth, query)
  }
  @Post('me/feed-events')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOkResponse({ type: FeedEventsResponseDto })
  events(@Headers('authorization') auth: string | undefined, @Body() body: FeedEventsDto) {
    return this.feed.record(auth, body)
  }
}
