/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateDirectMessageDto } from '../models/CreateDirectMessageDto';
import type { CreateReportDto } from '../models/CreateReportDto';
import type { CreateTeamApplicationDto } from '../models/CreateTeamApplicationDto';
import type { ReviewReportDto } from '../models/ReviewReportDto';
import type { ReviewTeamApplicationDto } from '../models/ReviewTeamApplicationDto';
import type { TeamManagementCommandDto } from '../models/TeamManagementCommandDto';
import type { UpdateBadgePreferenceDto } from '../models/UpdateBadgePreferenceDto';
import type { UpdateHubStripOrderDto } from '../models/UpdateHubStripOrderDto';
import type { UpdateTeamMemberDto } from '../models/UpdateTeamMemberDto';
import type { UpdateTeamProfileDto } from '../models/UpdateTeamProfileDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SocialService {
    /**
     * 读取自己的展示标志及可选有效身份
     * @returns any
     * @throws ApiError
     */
    public static socialControllerProfileBadge(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/profile-badge',
        });
    }
    /**
     * 更换自己的展示标志，不改变身份权限
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static socialControllerUpdateProfileBadge(
        requestBody: UpdateBadgePreferenceDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/profile-badge',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 读取主队条关注球队与球员的排列顺序
     * @returns any
     * @throws ApiError
     */
    public static socialControllerHubStripOrderGet(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/hub-strip-order',
        });
    }
    /**
     * 保存主队条关注排列，主队固定最前且不写入本列表
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static socialControllerHubStripOrderPut(
        requestBody: UpdateHubStripOrderDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/hub-strip-order',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 读取当前用户关注的球员
     * @returns any
     * @throws ApiError
     */
    public static socialControllerPlayerFollows(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/player-follows',
        });
    }
    /**
     * 关注球员
     * @param playerId
     * @returns any
     * @throws ApiError
     */
    public static socialControllerFollowPlayer(
        playerId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/player-follows/{playerId}',
            path: {
                'playerId': playerId,
            },
        });
    }
    /**
     * 取消关注球员
     * @param playerId
     * @returns any
     * @throws ApiError
     */
    public static socialControllerUnfollowPlayer(
        playerId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/me/player-follows/{playerId}',
            path: {
                'playerId': playerId,
            },
        });
    }
    /**
     * 读取本人和球队的成员/申请关系
     * @param teamId
     * @returns any
     * @throws ApiError
     */
    public static socialControllerTeamRelationship(
        teamId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/teams/{teamId}/relationship',
            path: {
                'teamId': teamId,
            },
        });
    }
    /**
     * 提交入队申请
     * @param teamId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static socialControllerApplyToTeam(
        teamId: string,
        requestBody: CreateTeamApplicationDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/teams/{teamId}/join-applications',
            path: {
                'teamId': teamId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 读取队长管理台、成员和入队申请
     * @param teamId
     * @returns any
     * @throws ApiError
     */
    public static socialControllerCaptainWorkspace(
        teamId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/captain/teams/{teamId}',
            path: {
                'teamId': teamId,
            },
        });
    }
    /**
     * 保存本队公开资料，不改变赛事报名或历史名单
     * @param teamId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static socialControllerUpdateTeamProfile(
        teamId: string,
        requestBody: UpdateTeamProfileDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/captain/teams/{teamId}/profile',
            path: {
                'teamId': teamId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 批准或拒绝入队申请
     * @param teamId
     * @param applicationId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static socialControllerReviewApplication(
        teamId: string,
        applicationId: string,
        requestBody: ReviewTeamApplicationDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/captain/teams/{teamId}/applications/{applicationId}',
            path: {
                'teamId': teamId,
                'applicationId': applicationId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 调整球队成员位置
     * @param teamId
     * @param membershipId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static socialControllerUpdateMember(
        teamId: string,
        membershipId: string,
        requestBody: UpdateTeamMemberDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/captain/teams/{teamId}/members/{membershipId}',
            path: {
                'teamId': teamId,
                'membershipId': membershipId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 将成员移出球队
     * @param teamId
     * @param membershipId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static socialControllerRemoveMember(
        teamId: string,
        membershipId: string,
        requestBody: TeamManagementCommandDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/captain/teams/{teamId}/members/{membershipId}',
            path: {
                'teamId': teamId,
                'membershipId': membershipId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 读取点赞、回复、申请、投诉和私信通知
     * @returns any
     * @throws ApiError
     */
    public static socialControllerNotifications(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/notifications',
        });
    }
    /**
     * 全部标记已读
     * @returns any
     * @throws ApiError
     */
    public static socialControllerReadAllNotifications(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/notifications/read-all',
        });
    }
    /**
     * 标记一条通知已读
     * @param notificationId
     * @returns any
     * @throws ApiError
     */
    public static socialControllerReadNotification(
        notificationId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/notifications/{notificationId}/read',
            path: {
                'notificationId': notificationId,
            },
        });
    }
    /**
     * 提交投诉或问题反馈
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static socialControllerCreateReport(
        requestBody: CreateReportDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/reports',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 读取本人投诉与处理结果
     * @returns any
     * @throws ApiError
     */
    public static socialControllerMyReports(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/reports',
        });
    }
    /**
     * 管理员读取投诉处理台
     * @returns any
     * @throws ApiError
     */
    public static socialControllerAdminReports(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/reports',
        });
    }
    /**
     * 管理员处理投诉并回复提交者
     * @param reportId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static socialControllerReviewReport(
        reportId: string,
        requestBody: ReviewReportDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/admin/reports/{reportId}',
            path: {
                'reportId': reportId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 读取或搜索当前组织可私信用户
     * @returns any
     * @throws ApiError
     */
    public static socialControllerMessageDirectory(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/messages/directory',
        });
    }
    /**
     * 读取私信会话
     * @returns any
     * @throws ApiError
     */
    public static socialControllerConversations(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/messages/conversations',
        });
    }
    /**
     * 读取私信消息
     * @param conversationId
     * @returns any
     * @throws ApiError
     */
    public static socialControllerMessages(
        conversationId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/messages/conversations/{conversationId}',
            path: {
                'conversationId': conversationId,
            },
        });
    }
    /**
     * 标记会话已读
     * @param conversationId
     * @returns any
     * @throws ApiError
     */
    public static socialControllerReadConversation(
        conversationId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/messages/conversations/{conversationId}/read',
            path: {
                'conversationId': conversationId,
            },
        });
    }
    /**
     * 向同组织用户发送幂等私信
     * @param recipientUserId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static socialControllerSendMessage(
        recipientUserId: string,
        requestBody: CreateDirectMessageDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/messages/direct/{recipientUserId}',
            path: {
                'recipientUserId': recipientUserId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
