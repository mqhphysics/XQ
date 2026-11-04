/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LineupPlanCommandDto } from '../models/LineupPlanCommandDto';
import type { SaveLineupPlanDto } from '../models/SaveLineupPlanDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class CaptainLineupPlansService {
    /**
     * 读取本队云端战术和单场阵容计划
     * @param teamId
     * @returns any
     * @throws ApiError
     */
    public static lineupPlanControllerList(
        teamId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/captain/teams/{teamId}/lineup-plans',
            path: {
                'teamId': teamId,
            },
        });
    }
    /**
     * 幂等保存战术或单场阵容，校验版本并新增不可变历史
     * @param teamId
     * @param idempotencyKey
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static lineupPlanControllerSave(
        teamId: string,
        idempotencyKey: string,
        requestBody: SaveLineupPlanDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/captain/teams/{teamId}/lineup-plans',
            path: {
                'teamId': teamId,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 读取本队计划的不可变保存历史
     * @param teamId
     * @param planId
     * @param beforeVersion
     * @returns any
     * @throws ApiError
     */
    public static lineupPlanControllerHistory(
        teamId: string,
        planId: string,
        beforeVersion: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/captain/teams/{teamId}/lineup-plans/{planId}/revisions',
            path: {
                'teamId': teamId,
                'planId': planId,
            },
            query: {
                'beforeVersion': beforeVersion,
            },
        });
    }
    /**
     * 将全队战术设为默认阵容，不生成单场首发
     * @param teamId
     * @param planId
     * @param idempotencyKey
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static lineupPlanControllerSetDefault(
        teamId: string,
        planId: string,
        idempotencyKey: string,
        requestBody: LineupPlanCommandDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/captain/teams/{teamId}/lineup-plans/{planId}/default',
            path: {
                'teamId': teamId,
                'planId': planId,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 显式确认本场八人首发，发布当前不可变版本
     * @param teamId
     * @param planId
     * @param idempotencyKey
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static lineupPlanControllerConfirm(
        teamId: string,
        planId: string,
        idempotencyKey: string,
        requestBody: LineupPlanCommandDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/captain/teams/{teamId}/lineup-plans/{planId}/confirm',
            path: {
                'teamId': teamId,
                'planId': planId,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
