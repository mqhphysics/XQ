/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BeginImageTransferDto } from '../models/BeginImageTransferDto';
import type { ImageTransferDto } from '../models/ImageTransferDto';
import type { ImageTransferPartDto } from '../models/ImageTransferPartDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ImageTransferService {
    /**
     * @param id
     * @param requestBody
     * @returns ImageTransferDto
     * @throws ApiError
     */
    public static imageTransferControllerBegin(
        id: string,
        requestBody: BeginImageTransferDto,
    ): CancelablePromise<ImageTransferDto> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/image-transfers/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param index
     * @param requestBody
     * @returns ImageTransferDto
     * @throws ApiError
     */
    public static imageTransferControllerPart(
        id: string,
        index: number,
        requestBody: ImageTransferPartDto,
    ): CancelablePromise<ImageTransferDto> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/me/image-transfers/{id}/parts/{index}',
            path: {
                'id': id,
                'index': index,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
