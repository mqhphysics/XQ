/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ConfirmIdentityDto } from '../models/ConfirmIdentityDto';
import type { IdentityApplicationDto } from '../models/IdentityApplicationDto';
import type { IdentityRecordDto } from '../models/IdentityRecordDto';
import type { IdentityReviewDto } from '../models/IdentityReviewDto';
import type { RevokeIdentityRecordDto } from '../models/RevokeIdentityRecordDto';
import type { VerifyIdentityUserDto } from '../models/VerifyIdentityUserDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class IdentityService {
    /**
     * @returns any
     * @throws ApiError
     */
    public static identityControllerMe(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/identity',
        });
    }
    /**
     * @param idempotencyKey
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static identityControllerApply(
        idempotencyKey: string,
        requestBody: IdentityApplicationDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/me/identity/applications',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param idempotencyKey
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static identityControllerConfirm(
        idempotencyKey: string,
        requestBody: ConfirmIdentityDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/me/identity/confirm',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static identityControllerApplications(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/identity/applications',
        });
    }
    /**
     * @param id
     * @param idempotencyKey
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static identityControllerReview(
        id: string,
        idempotencyKey: string,
        requestBody: IdentityReviewDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/identity/applications/{id}/review',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static identityControllerRecords(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/identity/records',
        });
    }
    /**
     * @param idempotencyKey
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static identityControllerCreate(
        idempotencyKey: string,
        requestBody: IdentityRecordDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/identity/records',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param idempotencyKey
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static identityControllerVerifyUser(
        id: string,
        idempotencyKey: string,
        requestBody: VerifyIdentityUserDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/identity/records/{id}/verify-user',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param idempotencyKey
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static identityControllerRevoke(
        id: string,
        idempotencyKey: string,
        requestBody: RevokeIdentityRecordDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/identity/records/{id}/revoke',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
