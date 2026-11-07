/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DirectMessagePreviewDto } from './DirectMessagePreviewDto';
import type { NotificationActorDto } from './NotificationActorDto';
export type DirectConversationSummaryDto = {
    id: string;
    counterpart: NotificationActorDto;
    canSend: boolean;
    blocked: boolean;
    lastMessageAt: string | null;
    latestMessage: DirectMessagePreviewDto | null;
    unreadCount: number;
};
