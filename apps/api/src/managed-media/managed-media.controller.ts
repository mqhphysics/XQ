import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { ManagedMediaService } from './managed-media.service'
import { MediaVisibilityDto, ReviewMediaDto, SubmitMediaDto } from './managed-media.dto'

@Controller()
@ApiTags('managed-media')
@ApiBearerAuth()
@AuthorizeInApplicationService()
export class ManagedMediaController {
  constructor(@Inject(ManagedMediaService) private readonly service: ManagedMediaService) {}

  @Post('media-assets')
  @ApiBody({ type: SubmitMediaDto })
  submit(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: SubmitMediaDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.submit(authorization, body, getRequestId(request))
  }

  @Get('media-assets/mine')
  mine(
    @Headers('authorization') authorization: string | undefined,
    @Query('before') before?: string,
  ) {
    return this.service.mine(authorization, before)
  }

  @Get('admin/media-assets')
  queue(
    @Headers('authorization') authorization: string | undefined,
    @Query('before') before?: string,
  ) {
    return this.service.queue(authorization, before)
  }

  @Put('admin/media-assets/:id/review')
  @ApiBody({ type: ReviewMediaDto })
  review(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: ReviewMediaDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.review(authorization, id, body, getRequestId(request))
  }

  @Put('media-assets/:id/visibility')
  @ApiBody({ type: MediaVisibilityDto })
  visibility(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: MediaVisibilityDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.visibility(authorization, id, body, getRequestId(request))
  }

  @Get('media-assets/matches/:matchId/goals')
  forMatch(
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId') id: string,
  ) {
    return this.service.forMatch(authorization, id)
  }

  @Get('media-assets/users/:userId/presentation')
  presentation(
    @Headers('authorization') authorization: string | undefined,
    @Param('userId') id: string,
  ) {
    return this.service.presentation(authorization, id)
  }

  @Get('media-assets/:id/content')
  async content(
    @Headers('authorization') authorization: string | undefined,
    @Headers('range') range: string | undefined,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    await this.send(authorization, id, false, response, range)
  }

  @Get('media-assets/:id/poster')
  async poster(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    await this.send(authorization, id, true, response)
  }

  private async send(
    authorization: string | undefined,
    id: string,
    poster: boolean,
    response: Response,
    range?: string,
  ) {
    const media = await this.service.content(authorization, id, poster)
    // Anonymous reads only ever get approved, active media: allow a short browser cache.
    response.setHeader(
      'Cache-Control',
      authorization ? 'private, no-store' : 'private, max-age=600',
    )
    response.setHeader('Vary', 'Authorization')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    if (media.mimeType.startsWith('video/')) {
      // Video elements (Safari in particular) need byte ranges to play and seek.
      response.setHeader('Accept-Ranges', 'bytes')
      const total = media.body.length
      const parsed = /^bytes=(\d*)-(\d*)$/.exec(range?.trim() ?? '')
      if (parsed && (parsed[1] || parsed[2])) {
        let start = parsed[1] ? Number(parsed[1]) : Math.max(0, total - Number(parsed[2]))
        let end = parsed[1] && parsed[2] ? Number(parsed[2]) : total - 1
        end = Math.min(end, total - 1)
        if (!Number.isFinite(start) || start > end || start >= total) {
          response.status(416).setHeader('Content-Range', `bytes */${total}`)
          response.end()
          return
        }
        start = Math.max(0, start)
        response.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
        response.type(media.mimeType).send(media.body.subarray(start, end + 1))
        return
      }
    }
    response.type(media.mimeType).send(media.body)
  }
}
