import { HttpStatus, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { createTransport } from 'nodemailer'

import { ApiHttpException } from '../common/api-http.exception'

export type EmailPurpose =
  | 'REGISTER'
  | 'RESET_PASSWORD'
  | 'LOGIN'
  | 'VERIFY_EMAIL'
  | 'CHANGE_EMAIL_OLD'
  | 'CHANGE_EMAIL_NEW'
const labels: Record<EmailPurpose, string> = {
  REGISTER: '注册验证',
  RESET_PASSWORD: '找回密码',
  LOGIN: '邮箱登录',
  VERIFY_EMAIL: '验证绑定邮箱',
  CHANGE_EMAIL_OLD: '确认原邮箱',
  CHANGE_EMAIL_NEW: '绑定新邮箱',
}

@Injectable()
export class MailService {
  get enabled(): boolean {
    return process.env.EMAIL_AUTH_ENABLED === 'true'
  }

  requireConfigured(): string {
    const secret = process.env.EMAIL_CODE_SECRET?.trim()
    if (
      !this.enabled ||
      !process.env.MAIL_USER?.trim() ||
      !process.env.MAIL_PASSWORD?.trim() ||
      !secret ||
      secret.length < 32
    ) {
      throw new ApiHttpException(HttpStatus.SERVICE_UNAVAILABLE, {
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: '邮件服务尚未配置，请联系管理员完成发件邮箱设置',
      })
    }
    return secret
  }

  private transport() {
    this.requireConfigured()
    return createTransport({
      host: process.env.MAIL_HOST?.trim() || 'smtp.qq.com',
      port: Number(process.env.MAIL_PORT || 465),
      secure: process.env.MAIL_SECURE !== 'false',
      requireTLS: true,
      auth: { user: process.env.MAIL_USER!.trim(), pass: process.env.MAIL_PASSWORD!.trim() },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    })
  }

  async verifyConnection(): Promise<void> {
    await this.transport().verify()
  }

  async sendCode(email: string, code: string, purpose: EmailPurpose): Promise<void> {
    await this.send(
      email,
      `【晓球】${labels[purpose]}验证码`,
      `你正在进行晓球${labels[purpose]}。\n\n验证码：${code}\n5分钟内有效，仅可使用一次。请勿向任何人透露验证码。\n\n如果不是你本人操作，请忽略本邮件。`,
    )
  }

  async sendPasswordChanged(email: string): Promise<void> {
    await this.send(
      email,
      '【晓球】密码已重置',
      '你的晓球账号密码已重置，旧登录会话已失效。请使用新密码重新登录。\n如果不是你本人操作，请立即联系管理员。',
    )
  }

  private async send(email: string, subject: string, text: string): Promise<void> {
    const result = await this.transport().sendMail({
      from: {
        name: process.env.MAIL_FROM_NAME?.trim() || '晓球',
        address: process.env.MAIL_USER!.trim(),
      },
      to: email,
      subject,
      text,
    })
    if (!result.accepted.length || result.rejected.length) throw new Error('MAIL_NOT_ACCEPTED')
  }
}
