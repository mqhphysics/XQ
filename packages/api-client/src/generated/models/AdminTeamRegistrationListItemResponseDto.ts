/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AdminTeamRegistrationListItemResponseDto = {
    registrationId: string;
    teamId: string;
    teamCode: string;
    teamName: string;
    registrationStatus: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'WITHDRAWN' | 'SUSPENDED';
    rosterStatus: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'LOCKED' | 'REOPENED' | 'WITHDRAWN' | null;
    rosterSubmissionVersion: number | null;
    rosterSnapshotVersion: number | null;
    playerCount: number;
    dataQualityStatus: 'CLEAN' | 'WARNING' | 'ERROR' | null;
    warningCodes: Array<string>;
    contactName: string | null;
    contactPhoneMasked: string | null;
};

