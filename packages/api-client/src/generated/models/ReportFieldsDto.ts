/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReportEventDto } from './ReportEventDto';
export type ReportFieldsDto = {
    /**
     * 普通比赛比分，点球大战单独填写
     */
    homeScore: string;
    awayScore: string;
    /**
     * 没有点球大战时为空字符串
     */
    homePenaltyScore: string;
    awayPenaltyScore: string;
    outcome: 'FINISHED' | 'HOME_FORFEIT' | 'AWAY_FORFEIT' | 'ABANDONED';
    events: Array<ReportEventDto>;
    notes: string;
};

