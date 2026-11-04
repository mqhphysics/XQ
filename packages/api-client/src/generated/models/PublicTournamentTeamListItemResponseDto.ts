/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PublicTournamentTeamListItemResponseDto = {
    id: string;
    tournamentId: string;
    teamCode: string;
    name: string;
    shortName: string | null;
    registrationStatus: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'WITHDRAWN' | 'SUSPENDED';
    rosterStatus: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'LOCKED' | 'REOPENED' | 'WITHDRAWN';
    rosterPlayerCount: number;
};

