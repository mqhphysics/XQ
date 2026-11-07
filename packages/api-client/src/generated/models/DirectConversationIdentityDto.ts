/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NotificationActorDto } from './NotificationActorDto';
export type DirectConversationIdentityDto = {
    id: string;
    counterpart: NotificationActorDto;
    canSend: boolean;
    blocked: boolean;
};
