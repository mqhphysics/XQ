/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PostSummaryDto } from './PostSummaryDto';
export type FeedResponseDto = {
    items: Array<PostSummaryDto>;
    batchId: string;
    tournamentId: string;
    nextCursor: number | null;
    algorithm: string;
    modelState: 'READY' | 'TRAINING' | 'COLD';
    modelVersion: string | null;
};

