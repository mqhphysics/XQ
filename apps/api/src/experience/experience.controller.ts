import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger'

import { getOrganizationId, getRequestId, type RequestWithId } from '../common/request-context'
import {
  CreateCommentDto,
  CreateMatchReviewDto,
  CreatePostDto,
  PostTagQueryDto,
  SearchQueryDto,
  UpdateTeamPreferencesDto,
  ContentVersionDto,
  UpdateCommentDto,
  UpdatePostDto,
} from './experience.dto'
import { ExperienceService } from './experience.service'
import {
  CommentResponseDto,
  FavoritePostsDto,
  FavoritePostsQueryDto,
  PostDetailDto,
} from './post-response.dto'
import { MatchOfficialDto } from './match-personnel.dto'

@ApiTags('experience')
@ApiExtraModels(SearchQueryDto, PostTagQueryDto)
@Controller()
export class ExperienceController {
  constructor(@Inject(ExperienceService) private readonly experienceService: ExperienceService) {}

  @Get('public/home')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取五入口产品首页聚合数据' })
  @ApiOkResponse({
    description: '赛事、赛事主办公告、平台官方公告、焦点比赛、球队和社区动态',
  })
  home(
    @Req() request: RequestWithId,
    @Headers('authorization') authorization: string | undefined,
    @Query('tournamentId') tournamentId: string | undefined,
    @Query('competitionId') competitionDefinitionId: string | undefined,
    @Query('seasonId') seasonId: string | undefined,
  ) {
    return this.experienceService.getHome(
      getOrganizationId(request),
      authorization,
      tournamentId,
      competitionDefinitionId || seasonId ? { competitionDefinitionId, seasonId } : undefined,
    )
  }

  @Get('public/search')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '按球员、球队、比赛和动态搜索' })
  search(
    @Req() request: RequestWithId,
    @Query() query: SearchQueryDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.experienceService.search(
      getOrganizationId(request),
      query,
      query.tournamentId,
      query.competitionId || query.seasonId
        ? { competitionDefinitionId: query.competitionId, seasonId: query.seasonId }
        : undefined,
      authorization,
    )
  }

  @Get('public/seasons')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取可切换赛季' })
  seasons(@Req() request: RequestWithId) {
    return this.experienceService.listSeasons(getOrganizationId(request))
  }

  @Get('public/post-tags')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取常用话题以及公开球队、球员标签建议' })
  postTags(@Req() request: RequestWithId, @Query() query: PostTagQueryDto) {
    return this.experienceService.suggestPostTags(
      getOrganizationId(request),
      query.query,
      query.tournamentId,
    )
  }

  @Get('public/tournaments/:tournamentId/competition-data')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取积分榜、淘汰赛和球员榜单' })
  competitionData(@Req() request: RequestWithId, @Param('tournamentId') tournamentId: string) {
    return this.experienceService.getCompetitionData(getOrganizationId(request), tournamentId)
  }

  @Get('public/teams/:teamId/dashboard')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取球队战绩、赛程与完整名单' })
  teamDashboard(
    @Req() request: RequestWithId,
    @Headers('authorization') authorization: string | undefined,
    @Param('teamId') teamId: string,
    @Query('tournamentId') tournamentId: string | undefined,
  ) {
    return this.experienceService.getTeamDashboard(
      getOrganizationId(request),
      teamId,
      tournamentId,
      authorization,
    )
  }

  @Get('public/players/:playerId')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取完整公开球员档案与赛季数据' })
  player(
    @Req() request: RequestWithId,
    @Param('playerId') playerId: string,
    @Query('tournamentId') tournamentId: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.experienceService.getPlayer(
      getOrganizationId(request),
      playerId,
      tournamentId,
      authorization,
    )
  }

  @Get('public/people/:userId')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取人物公开资料、有效身份、关联球员和已公开动态' })
  person(
    @Req() request: RequestWithId,
    @Param('userId') userId: string,
    @Query('tournamentId') tournamentId: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.experienceService.getPerson(
      getOrganizationId(request),
      userId,
      tournamentId,
      authorization,
    )
  }

  @Get('public/matches/:matchId/experience')
  @ApiExtraModels(MatchOfficialDto)
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        officials: { type: 'array', items: { $ref: getSchemaPath(MatchOfficialDto) } },
      },
    },
  })
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取评分、比分、事件时间轴和阵容' })
  match(
    @Req() request: RequestWithId,
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId') matchId: string,
  ) {
    return this.experienceService.getMatchExperience(
      getOrganizationId(request),
      matchId,
      authorization,
    )
  }

  @Post('matches/:matchId/reviews')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交或更新当前用户的比赛评分' })
  @ApiOkResponse({ description: '更新后的比赛体验数据' })
  @ApiBody({ type: CreateMatchReviewDto })
  reviewMatch(
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId') matchId: string,
    @Body() body: CreateMatchReviewDto,
  ) {
    return this.experienceService.reviewMatch(authorization, matchId, body)
  }

  @Get('public/posts')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取社区与官方动态' })
  posts(
    @Req() request: RequestWithId,
    @Headers('authorization') authorization: string | undefined,
    @Query('tournamentId') tournamentId: string | undefined,
  ) {
    return this.experienceService.listPosts(getOrganizationId(request), authorization, tournamentId)
  }

  @Get('public/posts/:postId')
  @ApiOkResponse({ type: PostDetailDto })
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取动态与评论详情' })
  post(
    @Req() request: RequestWithId,
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
  ) {
    return this.experienceService.getPost(getOrganizationId(request), postId, authorization)
  }

  @Get('me/team-preferences')
  @ApiBearerAuth()
  @ApiOperation({ summary: '读取当前用户主队与关注球队' })
  teamPreferences(
    @Headers('authorization') authorization: string | undefined,
    @Query('tournamentId') tournamentId: string | undefined,
  ) {
    return this.experienceService.getTeamPreferences(authorization, tournamentId)
  }

  @Put('me/team-preferences')
  @ApiBearerAuth()
  @ApiOperation({ summary: '保存当前用户主队与关注球队' })
  @ApiBody({ type: UpdateTeamPreferencesDto })
  updateTeamPreferences(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdateTeamPreferencesDto,
  ) {
    return this.experienceService.updateTeamPreferences(authorization, body)
  }

  @Post('community/posts')
  @ApiBearerAuth()
  @ApiOperation({ summary: '发布社区动态' })
  @ApiCreatedResponse({ description: '已发布动态' })
  @ApiBody({ type: CreatePostDto })
  createPost(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreatePostDto,
    @Req() request: RequestWithId,
  ) {
    return this.experienceService.createPost(authorization, body, getRequestId(request))
  }

  @Put('community/posts/:postId/like')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: '将动态设为已点赞（可安全重试）' })
  like(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
  ) {
    return this.experienceService.setLike(authorization, postId, true)
  }

  @Delete('community/posts/:postId/like')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: '将动态设为未点赞（可安全重试）' })
  unlike(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
  ) {
    return this.experienceService.setLike(authorization, postId, false)
  }

  @Post('community/posts/:postId/comments')
  @ApiCreatedResponse({ type: CommentResponseDto })
  @ApiBearerAuth()
  @ApiOperation({ summary: '发表评论' })
  @ApiBody({ type: CreateCommentDto })
  createComment(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
    @Body() body: CreateCommentDto,
  ) {
    return this.experienceService.createComment(authorization, postId, body)
  }

  @Put('community/posts/:postId/favorite')
  @ApiBearerAuth()
  favorite(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
  ) {
    return this.experienceService.setPostFavorite(authorization, postId, true)
  }

  @Get('me/favorite-posts')
  @ApiExtraModels(FavoritePostsQueryDto)
  @ApiOkResponse({ type: FavoritePostsDto })
  @ApiBearerAuth()
  @ApiOperation({ summary: '按收藏时间倒序读取本人当前组织内可访问的动态' })
  favoritePosts(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: FavoritePostsQueryDto,
  ) {
    return this.experienceService.listFavoritePosts(authorization, query.before, query.limit)
  }

  @Delete('community/posts/:postId/favorite')
  @ApiBearerAuth()
  unfavorite(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
  ) {
    return this.experienceService.setPostFavorite(authorization, postId, false)
  }

  @Put('community/posts/:postId/comments/:commentId/like')
  @ApiBearerAuth()
  likeComment(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.experienceService.setCommentLike(authorization, postId, commentId, true)
  }

  @Delete('community/posts/:postId/comments/:commentId/like')
  @ApiBearerAuth()
  unlikeComment(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.experienceService.setCommentLike(authorization, postId, commentId, false)
  }

  @Patch('community/posts/:postId')
  @ApiBearerAuth()
  @ApiBody({ type: UpdatePostDto })
  updatePost(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
    @Body() body: UpdatePostDto,
    @Req() request: RequestWithId,
  ) {
    return this.experienceService.updatePost(authorization, postId, body, getRequestId(request))
  }

  @Delete('community/posts/:postId')
  @ApiBearerAuth()
  @ApiBody({ type: ContentVersionDto })
  deletePost(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
    @Body() body: ContentVersionDto,
    @Req() request: RequestWithId,
  ) {
    return this.experienceService.deletePost(authorization, postId, body, getRequestId(request))
  }

  @Patch('community/posts/:postId/comments/:commentId')
  @ApiBearerAuth()
  @ApiBody({ type: UpdateCommentDto })
  updateComment(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Body() body: UpdateCommentDto,
    @Req() request: RequestWithId,
  ) {
    return this.experienceService.updateComment(
      authorization,
      postId,
      commentId,
      body,
      getRequestId(request),
    )
  }

  @Delete('community/posts/:postId/comments/:commentId')
  @ApiBearerAuth()
  @ApiBody({ type: ContentVersionDto })
  deleteComment(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Body() body: ContentVersionDto,
    @Req() request: RequestWithId,
  ) {
    return this.experienceService.deleteComment(
      authorization,
      postId,
      commentId,
      body,
      getRequestId(request),
    )
  }
}

function PublicOrganizationHeader() {
  return ApiHeader({
    name: 'x-organization-id',
    required: false,
    description: '组织 UUID；可使用会话或部署默认组织',
  })
}
