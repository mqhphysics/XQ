/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EmailChangeCodeDto } from '../models/EmailChangeCodeDto';
import type { EmailChangeVerifyDto } from '../models/EmailChangeVerifyDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class EmailChangeService {
    /**
     * @returns any
     * @throws ApiError
     */
    public static emailChangeControllerStart(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/email/change/start',
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static emailChangeControllerCode(
        requestBody: EmailChangeCodeDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/email/change/code',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static emailChangeControllerVerifyOld(
        requestBody: EmailChangeVerifyDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/email/change/verify-old',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static emailChangeControllerComplete(
        requestBody: EmailChangeVerifyDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/email/change/complete',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
