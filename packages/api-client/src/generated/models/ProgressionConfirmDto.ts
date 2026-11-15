/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ProgressionConfirmDto = {
    ruleVersionId: string;
    expectedVersion: number;
    /**
     * 当前预览的赛果来源和目标对阵 SHA-256
     */
    sourceHash: string;
    reason: string;
};
