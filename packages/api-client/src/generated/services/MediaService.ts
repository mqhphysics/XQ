/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UploadAvatarDto } from '../models/UploadAvatarDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class MediaService {
    /**
     * 读取用户、球员、球队共用的默认背景或默认头像
     * @param fileName
     * @returns any
     * @throws ApiError
     */
    public static mediaControllerDefaults(
        fileName: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/media/defaults/{fileName}',
            path: {
                'fileName': fileName,
            },
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static mediaControllerGuardStatus(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/media/guard-status',
        });
    }
    /**
     * 保存浏览器裁剪压缩后的当前用户头像
     * @param requestBody
     * @returns any 返回头像元数据与刷新后的用户资料
     * @throws ApiError
     */
    public static mediaControllerUpdateMyAvatar(
        requestBody: UploadAvatarDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/avatar',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 更新本人已关联球员（或管理员授权）的头像
     * @param playerId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static mediaControllerUpdatePlayerAvatar(
        playerId: string,
        requestBody: UploadAvatarDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/players/{playerId}/avatar',
            path: {
                'playerId': playerId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 读取公开头像文件
     * @param fileName
     * @returns any
     * @throws ApiError
     */
    public static mediaControllerAvatar(
        fileName: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/media/avatars/{fileName}',
            path: {
                'fileName': fileName,
            },
        });
    }
    /**
     * 读取本地演示队徽或人物示意照片
     * @param kind
     * @param fileName
     * @returns any
     * @throws ApiError
     */
    public static mediaControllerDemoMedia(
        kind: string,
        fileName: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/media/demo/{kind}/{fileName}',
            path: {
                'kind': kind,
                'fileName': fileName,
            },
        });
    }
    /**
     * 读取已公开动态关联的照片
     * @param organizationId
     * @param authorUserId
     * @param fileName
     * @returns any
     * @throws ApiError
     */
    public static mediaControllerPostImage(
        organizationId: string,
        authorUserId: string,
        fileName: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/media/posts/{organizationId}/{authorUserId}/{fileName}',
            path: {
                'organizationId': organizationId,
                'authorUserId': authorUserId,
                'fileName': fileName,
            },
        });
    }
    /**
     * 读取公开评论配图；评论或原动态隐藏后停止访问
     * @param commentId
     * @param fileName
     * @returns any
     * @throws ApiError
     */
    public static mediaControllerCommentImage(
        commentId: string,
        fileName: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/media/comments/{commentId}/{fileName}',
            path: {
                'commentId': commentId,
                'fileName': fileName,
            },
        });
    }
}
