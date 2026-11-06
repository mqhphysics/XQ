/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type RecognizeMatchSheetDto = {
    /**
     * 本场四官表 JPEG、PNG 或 WebP data URL，最多3张，每张4MB，总计10MB
     */
    images: Array<string>;
    /**
     * 辅助辨认的备注，不作为比赛事实
     */
    notes?: string;
};
