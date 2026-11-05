/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ReportOverviewItemDto = {
    matchId: string;
    reportStatus: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'CONFIRMED' | null;
    reportVersion: number;
    reportedAt: string | null;
    homeScore: number | null;
    awayScore: number | null;
    /**
     * 比分与进球事件、球员、时间对应完整；助攻选填
     */
    recorded: boolean;
};
