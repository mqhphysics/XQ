/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TechnicalOperationDto } from './TechnicalOperationDto';
export type RecordTechnicalStatisticsDto = {
    schemaVersion?: 1 | 2 | 3;
    expectedVersion: number;
    operations: Array<TechnicalOperationDto>;
};
