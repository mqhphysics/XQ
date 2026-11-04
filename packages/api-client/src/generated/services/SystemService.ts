/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LivenessResponseDto } from '../models/LivenessResponseDto';
import type { ReadinessResponseDto } from '../models/ReadinessResponseDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SystemService {
    /**
     * 检查 API 进程是否存活
     * @returns LivenessResponseDto API 进程存活，不检查下游依赖
     * @throws ApiError
     */
    public static appControllerLiveness(): CancelablePromise<LivenessResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/health/live',
        });
    }
    /**
     * 检查 API 是否可接收流量的兼容入口
     * @returns ReadinessResponseDto API 与 PostgreSQL 均可用
     * @throws ApiError
     */
    public static appControllerHealth(): CancelablePromise<ReadinessResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/health',
            errors: {
                503: `PostgreSQL 不可用，响应使用统一错误结构`,
            },
        });
    }
    /**
     * 检查 API 是否可接收流量
     * @returns ReadinessResponseDto API 与 PostgreSQL 均可用
     * @throws ApiError
     */
    public static appControllerReadiness(): CancelablePromise<ReadinessResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/health/ready',
            errors: {
                503: `PostgreSQL 不可用，响应使用统一错误结构`,
            },
        });
    }
}
