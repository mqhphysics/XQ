/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LineupSlotDto } from './LineupSlotDto';
export type LineupPayloadDto = {
    /**
     * 本场或默认阵容队长；不授予账号管理权限
     */
    captainPlayerId?: string | null;
    formation: string;
    format: 8;
    slots: Array<LineupSlotDto>;
    benchPlayerIds: Array<string>;
};

