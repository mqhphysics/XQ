/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type MatchClockDto = {
    serverNow: string;
    scheduledStartAt: string | null;
    autoStartsAt: string | null;
    startedAt: string | null;
    startSource: 'MANUAL' | 'AUTO' | 'PENDING';
    phase: 'PENDING' | 'FIRST_HALF' | 'HALF_TIME' | 'SECOND_HALF' | 'FINISHED' | 'UNAVAILABLE';
    periodMinutes: number;
    intervalMinutes: number;
    periods: number;
    elapsedSeconds: number;
    phaseElapsedSeconds: number;
    expectedEndAt: string | null;
    halfTimeStartsAt: string | null;
    secondHalfStartsAt: string | null;
    endedAt: string | null;
    canStart: boolean;
};
