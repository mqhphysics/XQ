/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminCenterCreatePlayerDto } from '../models/AdminCenterCreatePlayerDto';
import type { AdminCenterCreatePostDto } from '../models/AdminCenterCreatePostDto';
import type { AdminCenterCreateTeamDto } from '../models/AdminCenterCreateTeamDto';
import type { AdminCenterEditDto } from '../models/AdminCenterEditDto';
import type { AdminCenterMembershipDto } from '../models/AdminCenterMembershipDto';
import type { AdminCenterReasonDto } from '../models/AdminCenterReasonDto';
import type { AdminCenterRuleVersionDto } from '../models/AdminCenterRuleVersionDto';
import type { AdminOverviewResponseDto } from '../models/AdminOverviewResponseDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AdminCenterService {
    /**
     * @returns AdminOverviewResponseDto 本组织真实待办、资料数量及最近管理操作；不返回凭据或审计敏感明细
     * @throws ApiError
     */
    public static adminCenterControllerOverview(): CancelablePromise<AdminOverviewResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/overview',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerUsers(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/users',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerMembership(
        id: string,
        requestBody: AdminCenterMembershipDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/users/{id}/membership',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerRevoke(
        id: string,
        requestBody: AdminCenterReasonDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/users/{id}/revoke-sessions',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerTeams(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/teams',
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerCreateTeam(
        requestBody: AdminCenterCreateTeamDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/teams',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerPlayers(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/players',
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerCreatePlayer(
        requestBody: AdminCenterCreatePlayerDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/players',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerTeam(
        id: string,
        requestBody: AdminCenterEditDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/center/teams/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerPlayer(
        id: string,
        requestBody: AdminCenterEditDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/center/players/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param activity
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerAudit(
        activity: 'IMPORTANT' | 'ORDINARY' | 'ALL' = 'IMPORTANT',
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/audit',
            query: {
                'activity': activity,
            },
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerMedia(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/media',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerSystem(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/system',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerPosts(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/posts',
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerCreatePost(
        requestBody: AdminCenterCreatePostDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/posts',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerPost(
        id: string,
        requestBody: AdminCenterEditDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/center/posts/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminCenterControllerRuleVersion(
        id: string,
        requestBody: AdminCenterRuleVersionDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/tournaments/{id}/rule-versions',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
