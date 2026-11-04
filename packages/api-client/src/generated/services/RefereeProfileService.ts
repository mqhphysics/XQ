/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RefereeBioDto } from '../models/RefereeBioDto';
import type { RefereePeopleDto } from '../models/RefereePeopleDto';
import type { RefereeProfileDto } from '../models/RefereeProfileDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class RefereeProfileService {
    /**
     * @param userId
     * @returns RefereeProfileDto
     * @throws ApiError
     */
    public static refereeProfileControllerRead(
        userId: string,
    ): CancelablePromise<RefereeProfileDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/people/{userId}/referee',
            path: {
                'userId': userId,
            },
        });
    }
    /**
     * @param matchId
     * @returns RefereePeopleDto
     * @throws ApiError
     */
    public static refereeProfileControllerPeople(
        matchId: string,
    ): CancelablePromise<RefereePeopleDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/matches/{matchId}/referee-people',
            path: {
                'matchId': matchId,
            },
        });
    }
    /**
     * @param requestBody
     * @returns RefereeProfileDto
     * @throws ApiError
     */
    public static refereeProfileControllerSave(
        requestBody: RefereeBioDto,
    ): CancelablePromise<RefereeProfileDto> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/me/referee-profile',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
