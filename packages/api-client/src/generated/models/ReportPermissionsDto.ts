/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ReportPermissionsDto = {
    /**
     * 具备直接发布比赛记录的管理员权限，不受当前是否待审核影响
     */
    canPublish: boolean;
    canEdit: boolean;
    canSubmit: boolean;
    canViewHistory: boolean;
    canCorrect: boolean;
    canConfirm: boolean;
    canReturn: boolean;
};
