/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReportPlayerViewDto } from './ReportPlayerViewDto';
export type ReportTeamViewDto = {
    id: string;
    name: string;
    rosterSnapshotId: string | null;
    players: Array<ReportPlayerViewDto>;
};

