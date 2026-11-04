/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ProductConfigService {
    /**
     * 匿名读取产品开关；不返回组织、账号或业务数据，不授予权限
     * @returns any
     * @throws ApiError
     */
    public static productConfigControllerGetConfiguration(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/product/config',
        });
    }
    /**
     * 验证当前会话后读取组织内操作能力；命令仍重新鉴权
     * @returns any
     * @throws ApiError
     */
    public static productConfigControllerGetCapabilities(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/capabilities',
        });
    }
}
