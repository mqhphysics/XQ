/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type StudentRegistrationCorrectionDto = {
    /**
     * 操作原因
     */
    reason: string;
    expectedVersion: number;
    /**
     * 本人填写的学号，经管理员核验后才写入学生档案
     */
    studentNumber: string;
};

