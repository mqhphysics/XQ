/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AdminDirectMessagesQueryDto = {
    page?: number;
    pageSize?: number;
    /**
     * 聊天双方的昵称
     */
    query?: string;
    status?: 'PENDING' | 'APPROVED' | 'HIDDEN';
};
