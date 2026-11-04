/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CommentResponseDto } from '../models/CommentResponseDto';
import type { ContentVersionDto } from '../models/ContentVersionDto';
import type { CreateCommentDto } from '../models/CreateCommentDto';
import type { CreateMatchReviewDto } from '../models/CreateMatchReviewDto';
import type { CreatePostDto } from '../models/CreatePostDto';
import type { FavoritePostsDto } from '../models/FavoritePostsDto';
import type { MatchCheckinResponseDto } from '../models/MatchCheckinResponseDto';
import type { PostDetailDto } from '../models/PostDetailDto';
import type { UpdateCommentDto } from '../models/UpdateCommentDto';
import type { UpdatePostDto } from '../models/UpdatePostDto';
import type { UpdateTeamPreferencesDto } from '../models/UpdateTeamPreferencesDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ExperienceService {
    /**
     * 读取五入口产品首页聚合数据
     * @param xOrganizationId 组织 UUID；可使用会话或部署默认组织
     * @returns any 赛事、赛事主办公告、平台官方公告、焦点比赛、球队和社区动态
     * @throws ApiError
     */
    public static experienceControllerHome(
        xOrganizationId?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/home',
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 按球员、球队、比赛和动态搜索
     * @param query
     * @param competitionId
     * @param seasonId
     * @param tournamentId
     * @param category
     * @param xOrganizationId 组织 UUID；可使用会话或部署默认组织
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerSearch(
        query: string,
        competitionId?: string,
        seasonId?: string,
        tournamentId?: string,
        category?: 'ALL' | 'PLAYER' | 'TEAM' | 'MATCH' | 'POST',
        xOrganizationId?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/search',
            headers: {
                'x-organization-id': xOrganizationId,
            },
            query: {
                'competitionId': competitionId,
                'seasonId': seasonId,
                'tournamentId': tournamentId,
                'query': query,
                'category': category,
            },
        });
    }
    /**
     * 读取可切换赛季
     * @param xOrganizationId 组织 UUID；可使用会话或部署默认组织
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerSeasons(
        xOrganizationId?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/seasons',
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 读取常用话题以及公开球队、球员标签建议
     * @param tournamentId
     * @param query
     * @param xOrganizationId 组织 UUID；可使用会话或部署默认组织
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerPostTags(
        tournamentId?: string,
        query?: string,
        xOrganizationId?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/post-tags',
            headers: {
                'x-organization-id': xOrganizationId,
            },
            query: {
                'tournamentId': tournamentId,
                'query': query,
            },
        });
    }
    /**
     * 读取积分榜、淘汰赛和球员榜单
     * @param tournamentId
     * @param xOrganizationId 组织 UUID；可使用会话或部署默认组织
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerCompetitionData(
        tournamentId: string,
        xOrganizationId?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/tournaments/{tournamentId}/competition-data',
            path: {
                'tournamentId': tournamentId,
            },
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 读取球队战绩、赛程与完整名单
     * @param teamId
     * @param xOrganizationId 组织 UUID；可使用会话或部署默认组织
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerTeamDashboard(
        teamId: string,
        xOrganizationId?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/teams/{teamId}/dashboard',
            path: {
                'teamId': teamId,
            },
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 读取完整公开球员档案与赛季数据
     * @param playerId
     * @param xOrganizationId 组织 UUID；可使用会话或部署默认组织
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerPlayer(
        playerId: string,
        xOrganizationId?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/players/{playerId}',
            path: {
                'playerId': playerId,
            },
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 读取人物公开资料、有效身份、关联球员和已公开动态
     * @param userId
     * @param xOrganizationId 组织 UUID；可使用会话或部署默认组织
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerPerson(
        userId: string,
        xOrganizationId?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/people/{userId}',
            path: {
                'userId': userId,
            },
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 读取评分、比分、事件时间轴和阵容
     * @param matchId
     * @param xOrganizationId 组织 UUID；可使用会话或部署默认组织
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerMatch(
        matchId: string,
        xOrganizationId?: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/matches/{matchId}/experience',
            path: {
                'matchId': matchId,
            },
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 提交或更新当前用户的比赛评分
     * @param matchId
     * @param requestBody
     * @returns any 更新后的比赛体验数据
     * @throws ApiError
     */
    public static experienceControllerReviewMatch(
        matchId: string,
        requestBody: CreateMatchReviewDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/matches/{matchId}/reviews',
            path: {
                'matchId': matchId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 读取社区与官方动态
     * @param xOrganizationId 组织 UUID；可使用会话或部署默认组织
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerPosts(
        xOrganizationId?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/posts',
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 读取动态与评论详情
     * @param postId
     * @param xOrganizationId 组织 UUID；可使用会话或部署默认组织
     * @returns PostDetailDto
     * @throws ApiError
     */
    public static experienceControllerPost(
        postId: string,
        xOrganizationId?: string,
    ): CancelablePromise<PostDetailDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/posts/{postId}',
            path: {
                'postId': postId,
            },
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 读取当前用户主队与关注球队
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerTeamPreferences(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/team-preferences',
        });
    }
    /**
     * 保存当前用户主队与关注球队
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerUpdateTeamPreferences(
        requestBody: UpdateTeamPreferencesDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/team-preferences',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 发布社区动态
     * @param requestBody
     * @returns any 已发布动态
     * @throws ApiError
     */
    public static experienceControllerCreatePost(
        requestBody: CreatePostDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/community/posts',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 将动态设为已点赞（可安全重试）
     * @param postId
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerLike(
        postId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/community/posts/{postId}/like',
            path: {
                'postId': postId,
            },
        });
    }
    /**
     * 将动态设为未点赞（可安全重试）
     * @param postId
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerUnlike(
        postId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/community/posts/{postId}/like',
            path: {
                'postId': postId,
            },
        });
    }
    /**
     * 发表评论
     * @param postId
     * @param requestBody
     * @returns CommentResponseDto
     * @throws ApiError
     */
    public static experienceControllerCreateComment(
        postId: string,
        requestBody: CreateCommentDto,
    ): CancelablePromise<CommentResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/community/posts/{postId}/comments',
            path: {
                'postId': postId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param postId
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerFavorite(
        postId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/community/posts/{postId}/favorite',
            path: {
                'postId': postId,
            },
        });
    }
    /**
     * @param postId
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerUnfavorite(
        postId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/community/posts/{postId}/favorite',
            path: {
                'postId': postId,
            },
        });
    }
    /**
     * 按收藏时间倒序读取本人当前组织内可访问的动态
     * @returns FavoritePostsDto
     * @throws ApiError
     */
    public static experienceControllerFavoritePosts(): CancelablePromise<FavoritePostsDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/favorite-posts',
        });
    }
    /**
     * @param postId
     * @param commentId
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerLikeComment(
        postId: string,
        commentId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/community/posts/{postId}/comments/{commentId}/like',
            path: {
                'postId': postId,
                'commentId': commentId,
            },
        });
    }
    /**
     * @param postId
     * @param commentId
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerUnlikeComment(
        postId: string,
        commentId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/community/posts/{postId}/comments/{commentId}/like',
            path: {
                'postId': postId,
                'commentId': commentId,
            },
        });
    }
    /**
     * @param postId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerUpdatePost(
        postId: string,
        requestBody: UpdatePostDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/community/posts/{postId}',
            path: {
                'postId': postId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param postId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerDeletePost(
        postId: string,
        requestBody: ContentVersionDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/community/posts/{postId}',
            path: {
                'postId': postId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param postId
     * @param commentId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerUpdateComment(
        postId: string,
        commentId: string,
        requestBody: UpdateCommentDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/community/posts/{postId}/comments/{commentId}',
            path: {
                'postId': postId,
                'commentId': commentId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param postId
     * @param commentId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static experienceControllerDeleteComment(
        postId: string,
        commentId: string,
        requestBody: ContentVersionDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/community/posts/{postId}/comments/{commentId}',
            path: {
                'postId': postId,
                'commentId': commentId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param matchId
     * @param authorization
     * @returns MatchCheckinResponseDto
     * @throws ApiError
     */
    public static matchCheckinControllerGet(
        matchId: string,
        authorization: string,
    ): CancelablePromise<MatchCheckinResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/matches/{matchId}/check-in',
            path: {
                'matchId': matchId,
            },
            headers: {
                'authorization': authorization,
            },
        });
    }
    /**
     * @param matchId
     * @returns MatchCheckinResponseDto
     * @throws ApiError
     */
    public static matchCheckinControllerCheckIn(
        matchId: string,
    ): CancelablePromise<MatchCheckinResponseDto> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/matches/{matchId}/check-in',
            path: {
                'matchId': matchId,
            },
        });
    }
}
