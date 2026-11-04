/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type IdentityReviewDto = {
    /**
     * 无任职候选时，管理员为信息员或赛事管理员指定范围
     */
    scopeType?: 'MATCH' | 'TOURNAMENT';
    scopeId?: string;
    decision: 'APPROVED' | 'REJECTED';
    expectedVersion: number;
    resolvedCandidateId?: string;
    /**
     * 通过可留空，拒绝需至少两字原因
     */
    note?: string;
};

