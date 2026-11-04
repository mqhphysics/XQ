/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReportFieldsDto } from './ReportFieldsDto';
import type { ReportPlayerViewDto } from './ReportPlayerViewDto';
export type ReportRevisionViewDto = {
    version: number;
    savedAt: string;
    savedBy: string;
    status: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'CONFIRMED';
    action: 'SAVE' | 'SUBMIT' | 'RETURN' | 'CONFIRM' | 'CORRECT' | 'COMPLETE' | 'SAVE_SCORE';
    reason: string;
    fields: ReportFieldsDto;
    homeRosterSnapshotId: string;
    awayRosterSnapshotId: string;
    ruleVersionId: string;
    homePlayers?: Array<ReportPlayerViewDto>;
    awayPlayers?: Array<ReportPlayerViewDto>;
};

