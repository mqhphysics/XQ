/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type MatchOfficialDto = {
    role: 'REFEREE' | 'ASSISTANT_REFEREE_1' | 'ASSISTANT_REFEREE_2' | 'FOURTH_OFFICIAL';
    displayName: string;
    /**
     * 已有球员档案时返回；裁判无需创建球员档案
     */
    playerId: string | null;
};

