/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CampusMediaDto = {
    /**
     * 操作原因
     */
    reason: string;
    targetType: 'USER' | 'PLAYER';
    targetId: string;
    slot: 'AVATAR' | 'COVER' | 'PORTRAIT';
    expectedUpdatedAt: string;
    /**
     * 裁剪压缩后的图片Data URL
     */
    dataUrl: string;
};

