/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminSchedulePlanResponseDto } from './AdminSchedulePlanResponseDto';
import type { CompetitionRuleVersionResponseDto } from './CompetitionRuleVersionResponseDto';
import type { MatchResponseDto } from './MatchResponseDto';
import type { SeasonResponseDto } from './SeasonResponseDto';
import type { TeamResponseDto } from './TeamResponseDto';
import type { TournamentResponseDto } from './TournamentResponseDto';
import type { VenueResponseDto } from './VenueResponseDto';
export type AdminScheduleWorkbenchResponseDto = {
    seasons: Array<SeasonResponseDto>;
    tournaments: Array<TournamentResponseDto>;
    ruleVersions: Array<CompetitionRuleVersionResponseDto>;
    teams: Array<TeamResponseDto>;
    venues: Array<VenueResponseDto>;
    matches: Array<MatchResponseDto>;
    schedulePlans: Array<AdminSchedulePlanResponseDto>;
};

