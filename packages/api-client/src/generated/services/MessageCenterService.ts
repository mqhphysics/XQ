/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BlockedUserListDto } from '../models/BlockedUserListDto';
import type { MessageCenterNotificationPageDto } from '../models/MessageCenterNotificationPageDto';
import type { MessagePreferencesDto } from '../models/MessagePreferencesDto';
import type { MessageSummaryDto } from '../models/MessageSummaryDto';
import type { UpdateMessagePreferencesDto } from '../models/UpdateMessagePreferencesDto';
import type { UserBlockStateDto } from '../models/UserBlockStateDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class MessageCenterService {
    /**
     * 读取私信和通知分类未读；私信不重复计算通知副本
     * @param authorization
     * @returns MessageSummaryDto
     * @throws ApiError
     */
    public static messageCenterControllerSummary(
        authorization: string,
    ): CancelablePromise<MessageSummaryDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/message-center/summary',
            headers: {
                'authorization': authorization,
            },
        });
    }
    /**
     * @param category
     * @param before
     * @returns MessageCenterNotificationPageDto
     * @throws ApiError
     */
    public static messageCenterControllerNotifications(
        category: 'replies' | 'likes' | 'system',
        before?: string,
    ): CancelablePromise<MessageCenterNotificationPageDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/message-center/notifications',
            query: {
                'category': category,
                'before': before,
            },
        });
    }
    /**
     * @param id
     * @returns MessageSummaryDto
     * @throws ApiError
     */
    public static messageCenterControllerReadGroup(
        id: string,
    ): CancelablePromise<MessageSummaryDto> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/message-center/groups/{id}/read',
            path: {
                'id': id,
            },
        });
    }
    /**
     * @param authorization
     * @returns MessageSummaryDto
     * @throws ApiError
     */
    public static messageCenterControllerReadAll(
        authorization: string,
    ): CancelablePromise<MessageSummaryDto> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/message-center/read-all',
            headers: {
                'authorization': authorization,
            },
        });
    }
    /**
     * @param authorization
     * @returns MessagePreferencesDto
     * @throws ApiError
     */
    public static messageCenterControllerPreferences(
        authorization: string,
    ): CancelablePromise<MessagePreferencesDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/message-preferences',
            headers: {
                'authorization': authorization,
            },
        });
    }
    /**
     * @param requestBody
     * @returns MessagePreferencesDto
     * @throws ApiError
     */
    public static messageCenterControllerUpdatePreferences(
        requestBody: UpdateMessagePreferencesDto,
    ): CancelablePromise<MessagePreferencesDto> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/message-preferences',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param authorization
     * @returns BlockedUserListDto
     * @throws ApiError
     */
    public static messageCenterControllerBlocks(
        authorization: string,
    ): CancelablePromise<BlockedUserListDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/blocked-users',
            headers: {
                'authorization': authorization,
            },
        });
    }
    /**
     * @param id
     * @returns UserBlockStateDto
     * @throws ApiError
     */
    public static messageCenterControllerBlock(
        id: string,
    ): CancelablePromise<UserBlockStateDto> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/blocked-users/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * @param id
     * @returns UserBlockStateDto
     * @throws ApiError
     */
    public static messageCenterControllerUnblock(
        id: string,
    ): CancelablePromise<UserBlockStateDto> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/me/blocked-users/{id}',
            path: {
                'id': id,
            },
        });
    }
}
