/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OfficialReportResultDto } from './OfficialReportResultDto';
import type { ReportPermissionsDto } from './ReportPermissionsDto';
import type { ReportRevisionViewDto } from './ReportRevisionViewDto';
import type { ReportTeamViewDto } from './ReportTeamViewDto';
export type ReportWorkspaceResponseDto = {
    /**
     * 本场详情编辑的真实权限和完成状态
     */
    inline: Record<string, any>;
    editorToken?: string;
    completion?: Record<string, any>;
    organizationId: string;
    matchId: string;
    title: string;
    ruleVersionId: string | null;
    isKnockout: boolean;
    reportVersion: number;
    confirmedReportVersion: number | null;
    savedVersion?: number;
    homeTeam: ReportTeamViewDto;
    awayTeam: ReportTeamViewDto;
    permissions: ReportPermissionsDto;
    latest: ReportRevisionViewDto | null;
    reviewNote: string | null;
    blockingReasons?: Array<string>;
    officialResult: OfficialReportResultDto;
};
