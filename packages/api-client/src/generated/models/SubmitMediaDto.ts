/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SubmitMediaDto = {
    purpose: 'GOAL_GIF' | 'EVENT_CLIP' | 'USER_AVATAR' | 'PLAYER_AVATAR' | 'USER_BACKGROUND' | 'PLAYER_BACKGROUND' | 'PLAYER_PORTRAIT' | 'TEAM_CREST' | 'TEAM_BACKGROUND';
    targetId: string;
    clientSubmissionId: string;
    dataUrl: string;
    posterDataUrl?: string;
};
