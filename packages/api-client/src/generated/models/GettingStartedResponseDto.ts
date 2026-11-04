/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthUserDto } from './AuthUserDto';
import type { GettingStartedPlayerDto } from './GettingStartedPlayerDto';
import type { GettingStartedTeamDto } from './GettingStartedTeamDto';
export type GettingStartedResponseDto = {
    user: AuthUserDto;
    completed: boolean;
    players: Array<GettingStartedPlayerDto>;
    captainTeams: Array<GettingStartedTeamDto>;
    newlyInheritedTeamIds: Array<string>;
};
