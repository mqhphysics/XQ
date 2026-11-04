/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type StudentRegistrationReviewDto = {
    /**
     * 操作原因
     */
    reason: string;
    expectedVersion: number;
    decision: 'APPROVE' | 'RETURN';
    /**
     * 只有重名歧义时需要选择；唯一姓名的待补学号档案由服务端确定
     */
    studentRecordId?: string;
};

