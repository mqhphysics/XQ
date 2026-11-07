/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type RegistrationCheckDto = {
    registrationSource?: 'WEAPP' | 'WEB';
    /**
     * 姓名，小程序必填；开放注册的网站可省略
     */
    realName?: string;
    /**
     * 学号，小程序必填；开放注册的网站可省略
     */
    studentId?: string;
};
