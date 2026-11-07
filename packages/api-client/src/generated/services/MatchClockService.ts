/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MatchClockDto } from '../models/MatchClockDto';
import type { StartMatchClockDto } from '../models/StartMatchClockDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class MatchClockService {
    /**
     * @param matchId
     * @returns MatchClockDto
     * @throws ApiError
     */
    public static matchClockControllerRead(
        matchId: string,
    ): CancelablePromise<MatchClockDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/matches/{matchId}/clock',
            path: {
                'matchId': matchId,
            },
        });
    }
    /**
     * @param matchId
     * @param requestBody
     * @returns MatchClockDto
     * @throws ApiError
     */
    public static matchClockControllerStart(
        matchId: string,
        requestBody: StartMatchClockDto,
    ): CancelablePromise<MatchClockDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/matches/{matchId}/start',
            path: {
                'matchId': matchId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
