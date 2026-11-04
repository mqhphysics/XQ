/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ApiErrorResponseDto = {
    code: 'COMMON.BAD_REQUEST' | 'COMMON.VALIDATION_FAILED' | 'AUTH.UNAUTHORIZED' | 'AUTH.FORBIDDEN' | 'COMMON.NOT_FOUND' | 'COMMON.CONFLICT' | 'COMMON.IDEMPOTENCY_KEY_REUSED' | 'COMMON.SERVICE_UNAVAILABLE' | 'COMMON.INTERNAL_ERROR' | 'SCHEDULE.PLAN_ALREADY_PUBLISHED' | 'SCHEDULE.PLAN_EMPTY' | 'ROSTER.IMPORT_NOT_ALLOWED' | 'ROSTER.IMPORT_INVALID' | 'ROSTER.IMPORT_WARNINGS_NOT_ACKNOWLEDGED' | 'ROSTER.IMPORT_TOURNAMENT_AMBIGUOUS' | 'ROSTER.PLAYER_IDENTITY_CONFLICT';
    message: string;
    requestId: string;
    details?: Record<string, any>;
};

