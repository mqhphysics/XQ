/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RosterWorkflowPlayerDto } from './RosterWorkflowPlayerDto';
export type RosterWorkflowCommandDto = {
    action: 'SAVE' | 'SUBMIT' | 'RETURN' | 'APPROVE' | 'LOCK' | 'REOPEN';
    expectedVersion: number;
    players?: Array<RosterWorkflowPlayerDto>;
    reason?: string;
};

