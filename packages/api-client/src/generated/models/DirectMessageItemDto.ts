/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminMessageNoticeDto } from './AdminMessageNoticeDto';
export type DirectMessageItemDto = {
    id: string;
    body: string;
    isMine: boolean;
    createdAt: string;
    kind: 'USER' | 'ADMIN_NOTICE';
    notice: AdminMessageNoticeDto | null;
    clientMessageId: string;
    readAt: string | null;
};
