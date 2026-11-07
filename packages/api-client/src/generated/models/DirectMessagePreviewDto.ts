/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminMessageNoticeDto } from './AdminMessageNoticeDto';
export type DirectMessagePreviewDto = {
    id: string;
    body: string;
    isMine: boolean;
    createdAt: string;
    kind: 'USER' | 'ADMIN_NOTICE';
    notice: AdminMessageNoticeDto | null;
};
