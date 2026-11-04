/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ReporterReviewDto = {
    /**
     * 操作原因
     */
    reason: string;
    expectedVersion: number;
    decision: 'CONFIRMED' | 'DISMISSED' | 'OVERTURNED';
};

