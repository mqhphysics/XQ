/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GettingStartedActionDto } from '../models/GettingStartedActionDto';
import type { GettingStartedCompleteDto } from '../models/GettingStartedCompleteDto';
import type { GettingStartedPlayerClaimDto } from '../models/GettingStartedPlayerClaimDto';
import type { GettingStartedResponseDto } from '../models/GettingStartedResponseDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class GettingStartedService {
    /**
     * @returns GettingStartedResponseDto
     * @throws ApiError
     */
    public static gettingStartedControllerRead(): CancelablePromise<GettingStartedResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/getting-started',
        });
    }
    /**
     * @param requestBody
     * @returns GettingStartedResponseDto
     * @throws ApiError
     */
    public static gettingStartedControllerMatch(
        requestBody: GettingStartedActionDto,
    ): CancelablePromise<GettingStartedResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/me/getting-started/match',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param requestBody
     * @returns GettingStartedResponseDto
     * @throws ApiError
     */
    public static gettingStartedControllerClaim(
        requestBody: GettingStartedPlayerClaimDto,
    ): CancelablePromise<GettingStartedResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/me/getting-started/player',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static gettingStartedControllerComplete(
        requestBody: GettingStartedCompleteDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/me/getting-started/complete',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
