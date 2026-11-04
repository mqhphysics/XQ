/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TechnicalTotalsDto } from './TechnicalTotalsDto';
export type TechnicalOperationDto = {
    id: string;
    kind: 'COUNT' | 'GOAL' | 'UNDO' | 'SET_TOTALS';
    occurredAt: string;
    teamId?: string;
    playerId?: Record<string, any> | null;
    metric?: 'PASS' | 'TACKLE' | 'DRIBBLE' | 'SHOT' | 'FOUL' | 'CHANCE';
    outcome?: 'SUCCESS' | 'FAILURE' | 'ATTEMPT' | 'ON_TARGET' | 'OFF_TARGET' | 'GOAL' | 'FOUL' | 'YELLOW_CARD' | 'RED_CARD';
    shotId?: string;
    targetId?: string;
    totals?: TechnicalTotalsDto;
    reason?: string;
};
