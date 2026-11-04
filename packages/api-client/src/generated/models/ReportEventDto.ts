/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ReportEventDto = {
    /**
     * 客户端事件稳定标识，确认投影时另外生成服务器 UUID
     */
    clientEventId: string;
    kind: 'GOAL' | 'OWN_GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUBSTITUTION';
    side: 'HOME' | 'AWAY';
    minute: string;
    /**
     * 空字符串表示没有补时
     */
    addedMinute: string;
    playerId: string;
    /**
     * 助攻或换上球员 ID；没有时为空字符串
     */
    relatedPlayerId: string;
};

