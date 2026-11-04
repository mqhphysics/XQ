/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RefereeAppearanceDto } from './RefereeAppearanceDto';
export type RefereeProfileDto = {
    isReferee: boolean;
    totalMatches: number;
    refereeMatches: number;
    assistantMatches: number;
    fourthOfficialMatches: number;
    yellowCards: number;
    redCards: number;
    bio: string;
    matches: Array<RefereeAppearanceDto>;
};
