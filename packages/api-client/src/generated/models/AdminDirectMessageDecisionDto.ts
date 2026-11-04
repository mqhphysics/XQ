/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AdminDirectMessageDecisionDto = {
    /**
     * 人工处理原因
     */
    reason: string;
    action: 'APPROVE' | 'HIDE' | 'RESTORE';
    expectedVersion: number;
};
