/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MatchResponseDto } from './MatchResponseDto';
import type { ScheduleRevisionResponseDto } from './ScheduleRevisionResponseDto';
import type { TournamentResponseDto } from './TournamentResponseDto';
export type TournamentScheduleResponseDto = {
    tournament: TournamentResponseDto;
    revision: ScheduleRevisionResponseDto;
    matches: Array<MatchResponseDto>;
};

