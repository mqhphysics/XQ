/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReportFieldsDto } from './ReportFieldsDto';
export type WriteMatchReportDto = {
    /**
     * 详情内编辑的开始凭据
     */
    editorToken?: string;
    /**
     * 同一保存及网络重试始终使用同一个键
     */
    clientActionId: string;
    expectedVersion: number;
    action: 'SAVE' | 'SUBMIT' | 'RETURN' | 'CONFIRM' | 'CORRECT' | 'COMPLETE' | 'SAVE_SCORE';
    reason: string;
    /**
     * SAVE/SUBMIT/CORRECT 必须绑定名单及规程版本；审核动作只复制已有快照
     */
    homeRosterSnapshotId?: string;
    awayRosterSnapshotId?: string;
    ruleVersionId?: string;
    fields?: ReportFieldsDto;
};

