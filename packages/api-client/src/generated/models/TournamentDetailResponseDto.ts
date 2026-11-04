/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CompetitionRuleVersionResponseDto } from './CompetitionRuleVersionResponseDto';
import type { SeasonResponseDto } from './SeasonResponseDto';
export type TournamentDetailResponseDto = {
    /**
     * 赛事列表中是否已有发布赛程
     */
    hasPublishedSchedule?: boolean;
    id: string;
    organizationId: string;
    seasonId: string;
    tournamentCode: string;
    name: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    season: SeasonResponseDto;
    ruleVersions: Array<CompetitionRuleVersionResponseDto>;
};

