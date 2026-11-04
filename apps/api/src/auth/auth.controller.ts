import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Ip,
  Patch,
  Post,
  Req,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { ApiErrorResponseDto } from '../common/api-error-response.dto'
import { getOrganizationId, getRequestId, type RequestWithId } from '../common/request-context'
import {
  AuthUserDto,
  LoginDto,
  LoginResponseDto,
  RegisterDto,
  ResetPasswordByIdentityDto,
  UpdateProfileDto,
  RegistrationCheckDto,
  RegistrationFeedbackDto,
  RegistrationCheckResponseDto,
  RegistrationFeedbackResponseDto,
} from './auth.dto'
import { AuthService } from './auth.service'
import { EmailCodeRequestDto, EmailPasswordResetDto, EmailVerificationDto } from './email-auth.dto'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('registration-check')
  @HttpCode(200)
  @ApiBody({ type: RegistrationCheckDto })
  @ApiOkResponse({ type: RegistrationCheckResponseDto })
  @ApiOperation({ summary: '注册前核对姓名与学号，仅返回匹配结果' })
  checkRegistration(@Body() body: RegistrationCheckDto, @Req() request: RequestWithId) {
    return this.authService.checkRegistration(
      getOrganizationId(request),
      body.realName,
      body.studentId,
    )
  }
  @Post('registration-feedback')
  @ApiBody({ type: RegistrationFeedbackDto })
  @ApiCreatedResponse({ type: RegistrationFeedbackResponseDto })
  @ApiOperation({ summary: '未注册访客提交注册问题，由管理中心处理' })
  registrationFeedback(@Body() body: RegistrationFeedbackDto, @Req() request: RequestWithId) {
    return this.authService.submitRegistrationFeedback(
      getOrganizationId(request),
      body,
      getRequestId(request),
    )
  }

  @Post('email/code')
  @ApiBody({ type: EmailCodeRequestDto })
  @HttpCode(202)
  @ApiOperation({ summary: '申请邮箱验证码；受理不等于送达' })
  requestEmailCode(
    @Body() body: EmailCodeRequestDto,
    @Ip() ip: string,
    @Req() request: RequestWithId,
    @Headers('authorization') authorization?: string,
  ) {
    return this.authService.requestEmailCode(
      body.email,
      body.purpose,
      getOrganizationId(request),
      {
        ip,
        requestId: getRequestId(request),
        userAgent: request.headers['user-agent'],
      },
      authorization,
    )
  }

  @Post('email/login')
  @ApiBody({ type: EmailVerificationDto })
  @HttpCode(200)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiOperation({ summary: '已验证邮箱验证码登录' })
  loginByEmail(
    @Body() body: EmailVerificationDto,
    @Ip() ip: string,
    @Req() request: RequestWithId,
  ) {
    return this.authService.loginByEmail(body, getOrganizationId(request), {
      ip,
      requestId: getRequestId(request),
      userAgent: request.headers['user-agent'],
    })
  }

  @Post('email/verify')
  @ApiBody({ type: EmailVerificationDto })
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthUserDto })
  @ApiOperation({ summary: '登录后验证当前绑定邮箱' })
  verifyEmail(
    @Body() body: EmailVerificationDto,
    @Headers('authorization') authorization: string | undefined,
    @Ip() ip: string,
    @Req() request: RequestWithId,
  ) {
    return this.authService.verifyCurrentEmail(authorization, body, {
      ip,
      requestId: getRequestId(request),
      userAgent: request.headers['user-agent'],
    })
  }

  @Post('password/reset-by-email')
  @ApiBody({ type: EmailPasswordResetDto })
  @HttpCode(204)
  @ApiOperation({ summary: '已验证邮箱验证码重置密码并撤销全部旧会话' })
  async resetByEmail(
    @Body() body: EmailPasswordResetDto,
    @Ip() ip: string,
    @Req() request: RequestWithId,
  ): Promise<void> {
    await this.authService.resetPasswordByEmail(body, getOrganizationId(request), {
      ip,
      requestId: getRequestId(request),
      userAgent: request.headers['user-agent'],
    })
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '使用用户名、昵称、实名、学号或邮箱登录' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  login(@Body() body: LoginDto, @Ip() ip: string, @Req() request: RequestWithId) {
    return this.authService.login(body.username, body.password, getOrganizationId(request), {
      ip,
      userAgent: request.headers['user-agent'],
    })
  }

  @Post('register')
  @ApiOperation({ summary: '注册实名学生账号' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: LoginResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  register(@Body() body: RegisterDto, @Ip() ip: string, @Req() request: RequestWithId) {
    return this.authService.register(body, getOrganizationId(request), {
      ip,
      requestId: getRequestId(request),
      userAgent: request.headers['user-agent'],
    })
  }

  @Post('password/reset-by-identity')
  @HttpCode(204)
  @ApiOperation({ summary: '演示环境通过实名与学号重置密码' })
  @ApiBody({ type: ResetPasswordByIdentityDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async resetPasswordByIdentity(
    @Body() body: ResetPasswordByIdentityDto,
    @Ip() ip: string,
    @Req() request: RequestWithId,
  ): Promise<void> {
    await this.authService.resetPasswordByIdentity(body, {
      ip,
      requestId: getRequestId(request),
      userAgent: request.headers['user-agent'],
    })
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '读取当前登录用户' })
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async me(@Headers('authorization') authorization: string | undefined) {
    return (await this.authService.requireSession(authorization)).user
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新当前用户的公开昵称、绑定邮箱与简介' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({ type: AuthUserDto })
  updateMe(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdateProfileDto,
    @Ip() ip: string,
    @Req() request: RequestWithId,
  ) {
    return this.authService.updateProfile(authorization, body, {
      ip,
      requestId: getRequestId(request),
      userAgent: request.headers['user-agent'],
    })
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: '撤销当前会话' })
  async logout(@Headers('authorization') authorization: string | undefined): Promise<void> {
    await this.authService.logout(authorization)
  }
}
