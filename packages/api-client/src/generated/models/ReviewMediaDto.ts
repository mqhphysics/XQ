/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ReviewMediaDto = {
    action: 'APPROVE' | 'REJECT';
    expectedVersion: number;
    /**
     * 通过可不填；驳回需说明原因
     */
    reason?: string;
};
