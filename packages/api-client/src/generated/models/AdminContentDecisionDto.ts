/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AdminContentDecisionDto = {
    /**
     * 通过审核可不填；下架或恢复需说明原因
     */
    reason?: string;
    action: 'APPROVE' | 'BLOCK' | 'RESTORE';
    expectedUpdatedAt: string;
};
