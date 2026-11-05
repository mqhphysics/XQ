/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UpdateTeamPreferencesDto = {
    /**
     * null 表示取消主队，保留传入的其他关注球队
     */
    primaryTeamId: string | null;
    followedTeamIds: Array<string>;
};
