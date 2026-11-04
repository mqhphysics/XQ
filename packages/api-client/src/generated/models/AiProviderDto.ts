/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AiProviderDto = {
    id?: string;
    name: string;
    provider: 'DEEPSEEK' | 'QWEN' | 'GLM' | 'DOUBAO' | 'CUSTOM';
    baseUrl: string;
    model: string;
    protocol: 'CHAT_COMPLETIONS' | 'REVIEW_GATEWAY';
    /**
     * 仅写入；已保存连接留空保留
     */
    apiKey?: string;
    clearKey?: boolean;
    expectedVersion?: number;
};
