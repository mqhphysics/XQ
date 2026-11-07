/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FocusTeamDto } from './FocusTeamDto';
import type { FocusVenueDto } from './FocusVenueDto';
export type FocusMatchDto = {
    id: string;
    tournamentId: string;
    matchCode: string;
    title: string;
    status: 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
    scheduledStartAt: string | null;
    homeTeam: FocusTeamDto | null;
    awayTeam: FocusTeamDto | null;
    homeScore: number | null;
    awayScore: number | null;
    homePenaltyScore: number | null;
    awayPenaltyScore: number | null;
    statusReason: string | null;
    venue: FocusVenueDto | null;
    stageName: string | null;
    stageType: string | null;
    groupName: string | null;
    roundName: string | null;
    focusGender: string;
    focusCupName: string;
};
