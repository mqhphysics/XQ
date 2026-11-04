/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AiModerationConfigDto } from '../models/AiModerationConfigDto';
import type { AiModerationDecisionDto } from '../models/AiModerationDecisionDto';
import type { AiProviderDto } from '../models/AiProviderDto';
import type { AiRulesDto } from '../models/AiRulesDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AiModerationService {
    /**
     * @returns any
     * @throws ApiError
     */
    public static aiModerationControllerConfig(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/ai-review/config',
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static aiModerationControllerSave(
        requestBody: AiModerationConfigDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/ai-review/config',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static aiModerationControllerTest(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/ai-review/test',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static aiModerationControllerProviders(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/ai-review/providers',
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static aiModerationControllerSaveProvider(
        requestBody: AiProviderDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/ai-review/providers',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static aiModerationControllerTestProvider(
        requestBody: AiProviderDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/ai-review/providers/test',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static aiModerationControllerActivateProvider(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/ai-review/providers/{id}/activate',
            path: {
                'id': id,
            },
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static aiModerationControllerSaveRules(
        requestBody: AiRulesDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/ai-review/rules',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static aiModerationControllerStats(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/ai-review/stats',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static aiModerationControllerJobs(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/ai-review/jobs',
        });
    }
    /**
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static aiModerationControllerRetry(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/ai-review/jobs/{id}/retry',
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
    public static aiModerationControllerDecision(
        id: string,
        requestBody: AiModerationDecisionDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/ai-review/jobs/{id}/decision',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
