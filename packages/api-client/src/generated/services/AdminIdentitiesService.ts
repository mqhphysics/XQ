/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminIdentityDto } from '../models/AdminIdentityDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AdminIdentitiesService {
    /**
     * 组织管理员读取本组织实名账号目录
     * @returns AdminIdentityDto
     * @throws ApiError
     */
    public static adminIdentityControllerList(): CancelablePromise<Array<AdminIdentityDto>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/identities',
        });
    }
}
