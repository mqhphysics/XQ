/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SelfPlayerProfileDto } from '../models/SelfPlayerProfileDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SelfProfileService {
    /**
     * @returns any
     * @throws ApiError
     */
    public static selfPlayerProfileControllerRead(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/player-profile',
        });
    }
    /**
     * @param idempotencyKey
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static selfPlayerProfileControllerSave(
        idempotencyKey: string,
        requestBody: SelfPlayerProfileDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/player-profile',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
