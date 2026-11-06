/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MatchTeamResponseDto } from './MatchTeamResponseDto';
import type { MatchVenueResponseDto } from './MatchVenueResponseDto';
export type MatchResponseDto = {
    /**
     * 双方正式比分已确认；与按时间计算的比赛状态分别表示，草稿不算已录入
     */
    recorded?: boolean;
    /**
     * 已确认主队比分，待补录明确返回null
     */
    homeScore: number | null;
    /**
     * 已确认客队比分，待补录明确返回null
     */
    awayScore: number | null;
    confirmedReportVersion: number | null;
    id: string;
    organizationId: string;
    tournamentId: string;
    matchCode: string;
    title: string;
    status: 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
    scheduledStartAt?: string | null;
    homeTeam?: MatchTeamResponseDto | null;
    awayTeam?: MatchTeamResponseDto | null;
    venue?: MatchVenueResponseDto | null;
};
