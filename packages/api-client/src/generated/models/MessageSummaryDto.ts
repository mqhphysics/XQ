/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MessagePreferencesDto } from './MessagePreferencesDto';
export type MessageSummaryDto = {
    directUnreadCount: number;
    repliesUnreadCount: number;
    likesUnreadCount: number;
    systemUnreadCount: number;
    badgeCount: number;
    hasNotificationDot: boolean;
    preferences: MessagePreferencesDto;
};
