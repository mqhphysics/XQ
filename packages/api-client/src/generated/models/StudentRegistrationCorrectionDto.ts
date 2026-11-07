/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type StudentRegistrationCorrectionDto = {
    /**
     * 无历史申请时使用0，否则使用最新申请版本
     */
    expectedVersion: number;
    /**
     * 申请更正后的真实姓名；旧客户端省略时沿用当前姓名
     */
    realName?: string;
    /**
     * 选填的更正说明
     */
    reason?: string;
    /**
     * 本人填写的学号，经管理员核验后才写入学生档案
     */
    studentNumber: string;
};
