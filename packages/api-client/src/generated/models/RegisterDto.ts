/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type RegisterDto = {
    /**
     * 填写邮箱且邮箱服务启用时必填，6位邮件验证码
     */
    emailCode?: string;
    /**
     * 可省略，由系统生成内部标识；可用姓名或学号登录
     */
    username?: string;
    /**
     * 可省略，默认生成晓球加5位数字的昵称，注册后可修改
     */
    displayName?: string;
    /**
     * 后台实名
     */
    realName: string;
    studentId: string;
    email?: string;
    /**
     * 至少6位，不限制字符类型
     */
    password: string;
};
