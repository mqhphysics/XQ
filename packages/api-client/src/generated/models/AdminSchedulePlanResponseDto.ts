/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AdminSchedulePlanResponseDto = {
    id: string;
    organizationId: string;
    tournamentId: string;
    name: string;
    status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
    publishedAt?: string | null;
    matchIds: Array<string>;
};

