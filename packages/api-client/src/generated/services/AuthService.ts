/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthUserDto } from '../models/AuthUserDto';
import type { EmailCodeRequestDto } from '../models/EmailCodeRequestDto';
import type { EmailPasswordResetDto } from '../models/EmailPasswordResetDto';
import type { EmailVerificationDto } from '../models/EmailVerificationDto';
import type { LoginDto } from '../models/LoginDto';
import type { LoginResponseDto } from '../models/LoginResponseDto';
import type { RegisterDto } from '../models/RegisterDto';
import type { RegistrationCheckDto } from '../models/RegistrationCheckDto';
import type { RegistrationCheckResponseDto } from '../models/RegistrationCheckResponseDto';
import type { RegistrationFeedbackDto } from '../models/RegistrationFeedbackDto';
import type { RegistrationFeedbackResponseDto } from '../models/RegistrationFeedbackResponseDto';
import type { ResetPasswordByIdentityDto } from '../models/ResetPasswordByIdentityDto';
import type { SwitchTestRoleDto } from '../models/SwitchTestRoleDto';
import type { UpdateProfileDto } from '../models/UpdateProfileDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthService {
    /**
     * 注册前核对姓名与学号，仅返回匹配结果
     * @param requestBody
     * @returns RegistrationCheckResponseDto
     * @throws ApiError
     */
    public static authControllerCheckRegistration(
        requestBody: RegistrationCheckDto,
    ): CancelablePromise<RegistrationCheckResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/registration-check',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 未注册访客提交注册问题，由管理中心处理
     * @param requestBody
     * @returns RegistrationFeedbackResponseDto
     * @throws ApiError
     */
    public static authControllerRegistrationFeedback(
        requestBody: RegistrationFeedbackDto,
    ): CancelablePromise<RegistrationFeedbackResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/registration-feedback',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 申请邮箱验证码；受理不等于送达
     * @param authorization
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static authControllerRequestEmailCode(
        authorization: string,
        requestBody: EmailCodeRequestDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/email/code',
            headers: {
                'authorization': authorization,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 已验证邮箱验证码登录
     * @param requestBody
     * @returns LoginResponseDto
     * @throws ApiError
     */
    public static authControllerLoginByEmail(
        requestBody: EmailVerificationDto,
    ): CancelablePromise<LoginResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/email/login',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 登录后验证当前绑定邮箱
     * @param requestBody
     * @returns AuthUserDto
     * @throws ApiError
     */
    public static authControllerVerifyEmail(
        requestBody: EmailVerificationDto,
    ): CancelablePromise<AuthUserDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/email/verify',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 已验证邮箱验证码重置密码并撤销全部旧会话
     * @param requestBody
     * @returns void
     * @throws ApiError
     */
    public static authControllerResetByEmail(
        requestBody: EmailPasswordResetDto,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/password/reset-by-email',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 使用用户名、昵称、实名、学号或邮箱登录
     * @param requestBody
     * @returns LoginResponseDto
     * @throws ApiError
     */
    public static authControllerLogin(
        requestBody: LoginDto,
    ): CancelablePromise<LoginResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/login',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 注册实名学生账号
     * @param requestBody
     * @returns LoginResponseDto
     * @throws ApiError
     */
    public static authControllerRegister(
        requestBody: RegisterDto,
    ): CancelablePromise<LoginResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/register',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 演示环境通过实名与学号重置密码
     * @param requestBody
     * @returns void
     * @throws ApiError
     */
    public static authControllerResetPasswordByIdentity(
        requestBody: ResetPasswordByIdentityDto,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/password/reset-by-identity',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 读取当前登录用户
     * @returns AuthUserDto
     * @throws ApiError
     */
    public static authControllerMe(): CancelablePromise<AuthUserDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/auth/me',
        });
    }
    /**
     * 更新当前用户的公开昵称、绑定邮箱与简介
     * @param requestBody
     * @returns AuthUserDto
     * @throws ApiError
     */
    public static authControllerUpdateMe(
        requestBody: UpdateProfileDto,
    ): CancelablePromise<AuthUserDto> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/auth/me',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 撤销当前会话
     * @returns void
     * @throws ApiError
     */
    public static authControllerLogout(): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/logout',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static testRoleControllerList(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/auth/test-roles',
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static testRoleControllerSwitch(
        requestBody: SwitchTestRoleDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/auth/test-roles/switch',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
