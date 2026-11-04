/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PublicRosterPlayerResponseDto } from './PublicRosterPlayerResponseDto';
export type PublicTournamentTeamDetailResponseDto = {
    id: string;
    tournamentId: string;
    teamCode: string;
    name: string;
    shortName: string | null;
    registrationStatus: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'WITHDRAWN' | 'SUSPENDED';
    rosterStatus: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'LOCKED' | 'REOPENED' | 'WITHDRAWN';
    rosterPlayerCount: number;
    leaderDisplayName: string | null;
    coachDisplayName: string | null;
    rosterSnapshotVersion: number;
    players: Array<PublicRosterPlayerResponseDto>;
};

