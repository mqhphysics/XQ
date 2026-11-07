/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FeedEventsDto } from '../models/FeedEventsDto';
import type { FeedEventsResponseDto } from '../models/FeedEventsResponseDto';
import type { FeedResponseDto } from '../models/FeedResponseDto';
import type { FocusMatchesDto } from '../models/FocusMatchesDto';
import type { MatchInterestDto } from '../models/MatchInterestDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class RecommendationService {
    /**
     * @param xOrganizationId
     * @param tournamentId
     * @param competitionId
     * @param seasonId
     * @param batchId
     * @param refresh
     * @param cursor
     * @returns FeedResponseDto
     * @throws ApiError
     */
    public static feedControllerGet(
        xOrganizationId: string,
        tournamentId?: string,
        competitionId?: string,
        seasonId?: string,
        batchId?: string,
        refresh?: string,
        cursor?: number,
    ): CancelablePromise<FeedResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/feed',
            headers: {
                'X-Organization-Id': xOrganizationId,
            },
            query: {
                'tournamentId': tournamentId,
                'competitionId': competitionId,
                'seasonId': seasonId,
                'batchId': batchId,
                'refresh': refresh,
                'cursor': cursor,
            },
        });
    }
    /**
     * @param requestBody
     * @returns FeedEventsResponseDto
     * @throws ApiError
     */
    public static feedControllerEvents(
        requestBody: FeedEventsDto,
    ): CancelablePromise<FeedEventsResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/me/feed-events',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param tournamentId
     * @param authorization
     * @returns FocusMatchesDto
     * @throws ApiError
     */
    public static focusMatchesControllerList(
        tournamentId: string,
        authorization: string,
    ): CancelablePromise<FocusMatchesDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/focus-matches',
            headers: {
                'authorization': authorization,
            },
            query: {
                'tournamentId': tournamentId,
            },
        });
    }
    /**
     * @param matchId
     * @param authorization
     * @returns MatchInterestDto
     * @throws ApiError
     */
    public static focusMatchesControllerRecord(
        matchId: string,
        authorization: string,
    ): CancelablePromise<MatchInterestDto> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/matches/{matchId}/interest',
            path: {
                'matchId': matchId,
            },
            headers: {
                'authorization': authorization,
            },
        });
    }
}
