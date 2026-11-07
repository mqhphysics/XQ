/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UpdateMessagePreferencesDto = {
    likes: 'ALL' | 'FOLLOWING' | 'NONE';
    replies: 'ALL' | 'FOLLOWING' | 'NONE';
    directMessages: boolean;
    systemMessages: boolean;
    badges: boolean;
    expectedVersion: number;
};
