/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type TechnicalPlayerDto = {
    id: string;
    displayName: string;
    shirtNumber: string | null;
    avatarUrl?: string | null;
    position?: 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD' | null;
    /**
     * Starter in the confirmed match lineup; null when none is confirmed.
     */
    starter?: boolean | null;
};
