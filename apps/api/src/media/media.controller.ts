import { Body, Controller, Get, Headers, Inject, Param, Put, Query, Req, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { UploadAvatarDto } from '../auth/auth.dto'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { parseVariantWidth, resizeMedia } from './media-variant'
import { MediaService } from './media.service'

@ApiTags('media')
@Controller()
export class MediaController {
  constructor(@Inject(MediaService) private readonly mediaService: MediaService) {}

  @Get('media/defaults/:fileName')
  @ApiOperation({ summary: '读取用户、球员、球队共用的默认背景或默认头像' })
  async defaults(
    @Param('fileName') fileName: string,
    @Query('w') width: string | undefined,
    @Res() response: Response,
  ) {
    const picture = await this.mediaService.readDefault(fileName)
    const variant = await resizeMedia(picture.body, picture.mimeType, parseVariantWidth(width))
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    response.setHeader('X-Xiaoqiu-Media-Guard', '1')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.type(variant.mimeType).send(variant.body)
  }

  @Get('media/guard-status')
  guardStatus() {
    return { guardVersion: 1, cacheControl: 'no-store' }
  }

  @Put('me/avatar')
  @ApiBearerAuth()
  @ApiOperation({ summary: '保存浏览器裁剪压缩后的当前用户头像' })
  @ApiBody({ type: UploadAvatarDto })
  @ApiOkResponse({ description: '返回头像元数据与刷新后的用户资料' })
  updateMyAvatar(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UploadAvatarDto,
    @Req() request: RequestWithId,
  ) {
    return this.mediaService.updateMyAvatar(authorization, body.dataUrl, getRequestId(request))
  }

  @Put('players/:playerId/avatar')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新本人已关联球员（或管理员授权）的头像' })
  @ApiBody({ type: UploadAvatarDto })
  updatePlayerAvatar(
    @Headers('authorization') authorization: string | undefined,
    @Param('playerId') playerId: string,
    @Body() body: UploadAvatarDto,
    @Req() request: RequestWithId,
  ) {
    return this.mediaService.updatePlayerAvatar(
      authorization,
      playerId,
      body.dataUrl,
      getRequestId(request),
    )
  }

  @Get('media/avatars/:fileName')
  @ApiOperation({ summary: '读取公开头像文件' })
  async avatar(
    @Param('fileName') fileName: string,
    @Query('w') width: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const avatar = await this.mediaService.readAvatar(fileName)
    const variant = await resizeMedia(avatar.body, avatar.mimeType, parseVariantWidth(width))
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    response.setHeader('X-Xiaoqiu-Media-Guard', '1')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.type(variant.mimeType).send(variant.body)
  }

  @Get('media/demo/:kind/:fileName')
  @ApiOperation({ summary: '读取本地演示队徽或人物示意照片' })
  async demoMedia(
    @Param('kind') kind: string,
    @Param('fileName') fileName: string,
    @Query('w') width: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const media = await this.mediaService.readDemoMedia(kind, fileName)
    const requested = parseVariantWidth(width)
    const variant = await resizeMedia(media.body, media.mimeType, requested)
    // Seeded demo files never change in place; let browsers keep them for a week.
    response.setHeader('Cache-Control', 'public, max-age=604800')
    response.setHeader('X-Xiaoqiu-Media-Guard', '1')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.type(variant.mimeType).send(variant.body)
  }

  @Get('media/posts/:organizationId/:authorUserId/:fileName')
  @ApiOperation({ summary: '读取已公开动态关联的照片' })
  async postImage(
    @Param('organizationId') organizationId: string,
    @Param('authorUserId') authorUserId: string,
    @Param('fileName') fileName: string,
    @Query('w') width: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.mediaService.readPostImage(organizationId, authorUserId, fileName)
    const variant = await resizeMedia(image.body, image.mimeType, parseVariantWidth(width))
    // Browser-only cache (no shared/CDN copy) so a moderated takedown lands within minutes.
    response.setHeader('Cache-Control', 'private, max-age=600')
    response.setHeader('X-Xiaoqiu-Media-Guard', '1')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.type(variant.mimeType).send(variant.body)
  }

  @Get('media/comments/:commentId/:fileName')
  @ApiOperation({ summary: '读取公开评论配图；评论或原动态隐藏后停止访问' })
  async commentImage(
    @Param('commentId') commentId: string,
    @Param('fileName') fileName: string,
    @Query('w') width: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const picture = await this.mediaService.readCommentImage(commentId, fileName)
    const variant = await resizeMedia(picture.body, picture.mimeType, parseVariantWidth(width))
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Xiaoqiu-Media-Guard', '1')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.type(variant.mimeType).send(variant.body)
  }
}
