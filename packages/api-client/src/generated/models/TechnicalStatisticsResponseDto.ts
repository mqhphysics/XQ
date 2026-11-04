/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TechnicalOperationDto } from './TechnicalOperationDto';
import type { TechnicalTeamDto } from './TechnicalTeamDto';
export type TechnicalStatisticsResponseDto = {
    matchId: string;
    tournamentId: string;
    title: string;
    recorderUserId: string;
    canRecord: boolean;
    reason: string | null;
    version: number;
    teams: Array<TechnicalTeamDto>;
    operations: Array<TechnicalOperationDto>;
};
