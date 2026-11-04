/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type EmailPasswordResetDto = {
    email: string;
    /**
     * 邮件中的6位数字验证码
     */
    emailCode: string;
    /**
     * 至少6位，不限制字符类型
     */
    newPassword: string;
};

