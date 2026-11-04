/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProgressionConfirmDto } from '../models/ProgressionConfirmDto';
import type { ProgressionPreviewDto } from '../models/ProgressionPreviewDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ResultsService {
    /**
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static resultsControllerRead(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/tournaments/{id}/results',
            path: {
                'id': id,
            },
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static resultsControllerPreview(
        id: string,
        requestBody: ProgressionPreviewDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/tournaments/{id}/progression/preview',
            path: {
                'id': id,
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
    public static resultsControllerConfirm(
        id: string,
        idempotencyKey: string,
        requestBody: ProgressionConfirmDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/tournaments/{id}/progression/confirm',
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
