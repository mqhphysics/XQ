/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MediaVisibilityDto } from '../models/MediaVisibilityDto';
import type { ReviewMediaDto } from '../models/ReviewMediaDto';
import type { SubmitMediaDto } from '../models/SubmitMediaDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ManagedMediaService {
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static managedMediaControllerSubmit(
        requestBody: SubmitMediaDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/media-assets',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param before
     * @returns any
     * @throws ApiError
     */
    public static managedMediaControllerMine(
        before: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/media-assets/mine',
            query: {
                'before': before,
            },
        });
    }
    /**
     * @param before
     * @returns any
     * @throws ApiError
     */
    public static managedMediaControllerQueue(
        before: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/media-assets',
            query: {
                'before': before,
            },
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static managedMediaControllerReview(
        id: string,
        requestBody: ReviewMediaDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/admin/media-assets/{id}/review',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static managedMediaControllerVisibility(
        id: string,
        requestBody: MediaVisibilityDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/media-assets/{id}/visibility',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param matchId
     * @returns any
     * @throws ApiError
     */
    public static managedMediaControllerForMatch(
        matchId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/media-assets/matches/{matchId}/goals',
            path: {
                'matchId': matchId,
            },
        });
    }
    /**
     * @param userId
     * @returns any
     * @throws ApiError
     */
    public static managedMediaControllerPresentation(
        userId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/media-assets/users/{userId}/presentation',
            path: {
                'userId': userId,
            },
        });
    }
    /**
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static managedMediaControllerContent(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/media-assets/{id}/content',
            path: {
                'id': id,
            },
        });
    }
    /**
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static managedMediaControllerPoster(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/media-assets/{id}/poster',
            path: {
                'id': id,
            },
        });
    }
}
