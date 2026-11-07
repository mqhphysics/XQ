/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DirectConversationIdentityDto } from './DirectConversationIdentityDto';
import type { DirectMessageItemDto } from './DirectMessageItemDto';
export type DirectThreadDto = {
    conversation: DirectConversationIdentityDto;
    items: Array<DirectMessageItemDto>;
};
