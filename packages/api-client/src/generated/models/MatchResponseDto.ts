/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MatchTeamResponseDto } from './MatchTeamResponseDto';
import type { MatchVenueResponseDto } from './MatchVenueResponseDto';
export type MatchResponseDto = {
    /**
     * 已保存比赛录入记录；与按时间计算的比赛状态分别表示
     */
    recorded?: boolean;
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

