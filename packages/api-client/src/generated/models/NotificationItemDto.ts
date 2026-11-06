/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NotificationActorDto } from './NotificationActorDto';
export type NotificationItemDto = {
    id: string;
    type: string;
    messageCategory: string | null;
    title: string;
    body: string | null;
    linkPath: string | null;
    readAt: string | null;
    createdAt: string;
    actor: NotificationActorDto | null;
};
