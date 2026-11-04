/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CampusPlayerDto = {
    /**
     * 操作原因
     */
    reason: string;
    expectedUpdatedAt: string;
    jerseyName?: string;
    bio?: string;
    major?: string;
    hometown?: string;
    academicYear?: string;
    position?: 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD';
    dominantFoot?: 'LEFT' | 'RIGHT' | 'BOTH';
    heightCm?: number;
    ratingShooting?: number;
    ratingSpeed?: number;
    ratingDribbling?: number;
    ratingPassing?: number;
    ratingDefending?: number;
};

