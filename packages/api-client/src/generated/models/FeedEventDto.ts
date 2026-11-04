/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type FeedEventDto = {
    eventId: string;
    postId: string;
    batchId?: string;
    kind: 'IMPRESSION' | 'READ';
    durationMs: number;
};

