/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DependencyHealthDto } from './DependencyHealthDto';
export type ReadinessResponseDto = {
    service: 'api';
    status: 'ok';
    version: string;
    timestamp: string;
    requestId: string;
    database: DependencyHealthDto;
};

