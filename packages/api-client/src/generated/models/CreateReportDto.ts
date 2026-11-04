/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateReportDto = {
    /**
     * 客户端生成的投诉/反馈幂等键
     */
    clientReportId: string;
    targetType: 'POST' | 'COMMENT' | 'MATCH_REVIEW' | 'DIRECT_MESSAGE' | 'USER' | 'FEEDBACK';
    targetId?: string;
    reason: string;
    details?: string;
};

