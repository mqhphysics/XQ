/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MessageNotificationTargetDto } from './MessageNotificationTargetDto';
import type { NotificationActorDto } from './NotificationActorDto';
export type MessageCenterNotificationDto = {
    id: string;
    category: 'replies' | 'likes' | 'system';
    title: string;
    body: string | null;
    linkPath: string | null;
    readAt: string | null;
    createdAt: string;
    actors: Array<NotificationActorDto>;
    actorCount: number;
    unreadCount: number;
    target: MessageNotificationTargetDto | null;
};
