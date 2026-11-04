/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LineupPayloadDto } from './LineupPayloadDto';
export type SaveLineupPlanDto = {
    planId?: string;
    name: string;
    kind: 'TACTIC' | 'MATCH_LINEUP';
    expectedVersion: number;
    tournamentId?: string | null;
    matchId?: string | null;
    rosterSnapshotId?: string | null;
    payload: LineupPayloadDto;
};

