/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AiModerationConfigDto = {
    enabled: boolean;
    baseUrl: string;
    model: string;
    protocol: 'CHAT_COMPLETIONS' | 'REVIEW_GATEWAY';
    /**
     * 新密钥，仅写入；留空保留原密钥
     */
    apiKey?: string;
    clearKey?: boolean;
    expectedVersion: number;
    policies: Record<string, any>;
};
