/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RosterWorkflowCommandDto } from '../models/RosterWorkflowCommandDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class RosterWorkflowService {
    /**
     * 读取本人获授权球队的赛事名单工作台
     * @param tournamentId
     * @param teamId
     * @returns any
     * @throws ApiError
     */
    public static rosterWorkflowControllerRead(
        tournamentId: string,
        teamId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/roster/tournaments/{tournamentId}/teams/{teamId}',
            path: {
                'tournamentId': tournamentId,
                'teamId': teamId,
            },
        });
    }
    /**
     * 编辑、提交、退回、批准、锁定或开放补报名单
     * @param tournamentId
     * @param teamId
     * @param idempotencyKey
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static rosterWorkflowControllerExecute(
        tournamentId: string,
        teamId: string,
        idempotencyKey: string,
        requestBody: RosterWorkflowCommandDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/roster/tournaments/{tournamentId}/teams/{teamId}/commands',
            path: {
                'tournamentId': tournamentId,
                'teamId': teamId,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
