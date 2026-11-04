/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SchedulePlanResponseDto = {
    id: string;
    organizationId: string;
    tournamentId: string;
    name: string;
    status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
    publishedAt?: string | null;
};

