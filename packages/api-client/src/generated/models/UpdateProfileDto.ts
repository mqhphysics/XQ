/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UpdateProfileDto = {
    /**
     * 在用户主页显示球员身份
     */
    showPlayerIdentity?: boolean;
    /**
     * 公开昵称
     */
    displayName: string;
    /**
     * 仅兼容提交当前邮箱；更换需专用验证流程
     */
    email?: string;
    /**
     * 公开简介
     */
    bio?: string | null;
};

