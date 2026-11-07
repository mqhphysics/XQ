/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RecordTechnicalStatisticsDto } from '../models/RecordTechnicalStatisticsDto';
import type { TechnicalStatisticsResponseDto } from '../models/TechnicalStatisticsResponseDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class TechnicalStatisticsService {
    /**
     * @param matchId
     * @param schemaVersion
     * @returns TechnicalStatisticsResponseDto
     * @throws ApiError
     */
    public static technicalStatisticsControllerGet(
        matchId: string,
        schemaVersion?: 1 | 2 | 3,
    ): CancelablePromise<TechnicalStatisticsResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/matches/{matchId}/technical-statistics',
            path: {
                'matchId': matchId,
            },
            query: {
                'schemaVersion': schemaVersion,
            },
        });
    }
    /**
     * @param matchId
     * @param requestBody
     * @returns TechnicalStatisticsResponseDto
     * @throws ApiError
     */
    public static technicalStatisticsControllerRecord(
        matchId: string,
        requestBody: RecordTechnicalStatisticsDto,
    ): CancelablePromise<TechnicalStatisticsResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/matches/{matchId}/technical-statistics',
            path: {
                'matchId': matchId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
