import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { HttpStatus, Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import type { Prisma } from '../generated/prisma/client'
import { MailService, type EmailPurpose } from './mail.service'

export interface EmailRequestContext {
  ip?: string | undefined
  requestId: string
  userAgent?: string | undefined
}

@Injectable()
export class EmailCodeService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailCodeService.name)
  private readonly pending = new Set<Promise<void>>()
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  get enabled(): boolean {
    return this.mail.enabled
  }
  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(this.pending)
  }

  async requestCode(
    email: string,
    purpose: EmailPurpose,
    organizationId: string,
    request: EmailRequestContext,
    ownerId?: string,
    contextId?: string,
  ) {
    const secret = this.mail.requireConfigured()
    const normalized = normalizeEmail(email)
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
    const id = randomUUID()
    const now = new Date()
    const reservation = await this.prisma.$transaction(async (tx) => {
      // The mailbox lock keeps the 60-second resend interval atomic across processes.
      await lockMailbox(tx, normalized)
      const latest = await tx.emailAuthCode.findFirst({
        where: { emailNormalized: normalized },
        orderBy: { createdAt: 'desc' },
      })
      if (latest && now.getTime() - latest.createdAt.getTime() < 60_000) {
        throw new ApiHttpException(HttpStatus.TOO_MANY_REQUESTS, {
          code: ERROR_CODES.BAD_REQUEST,
          message: '验证码请求过于频繁，请稍后再试',
          details: {
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((60_000 - (now.getTime() - latest.createdAt.getTime())) / 1000),
            ),
          },
        })
      }
      const user = await tx.user.findFirst({
        where: {
          emailNormalized: normalized,
          status: 'ACTIVE',
          memberships: {
            some: {
              organizationId,
              status: 'ACTIVE',
              organization: { status: 'ACTIVE' },
            },
          },
        },
      })
      const exists = await tx.user.findUnique({
        where: { emailNormalized: normalized },
        select: { id: true },
      })
      const changeOwner =
        purpose === 'CHANGE_EMAIL_NEW' && ownerId
          ? await tx.user.findFirst({
              where: {
                id: ownerId,
                status: 'ACTIVE',
                memberships: {
                  some: { organizationId, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
                },
              },
              select: { id: true },
            })
          : null
      const eligible =
        purpose === 'REGISTER'
          ? !exists
          : purpose === 'CHANGE_EMAIL_NEW'
            ? Boolean(changeOwner && (!exists || exists.id === ownerId))
            : purpose === 'VERIFY_EMAIL' || purpose === 'CHANGE_EMAIL_OLD'
              ? Boolean(user && user.id === ownerId)
              : Boolean(user?.emailVerifiedAt)
      await tx.emailAuthCode.updateMany({
        where: { organizationId, emailNormalized: normalized, purpose, consumedAt: null },
        data: { consumedAt: now },
      })
      await tx.emailAuthCode.create({
        data: {
          id,
          organizationId,
          emailNormalized: normalized,
          purpose,
          contextId: contextId ?? null,
          userId: purpose === 'REGISTER' ? null : (changeOwner?.id ?? user?.id ?? null),
          codeDigest: digest(secret, id, normalized, purpose, organizationId, code),
          expiresAt: new Date(now.getTime() + 300_000),
          ipAddress: request.ip ?? null,
          sendStatus: eligible ? 'PENDING' : 'SUPPRESSED',
        },
      })
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: 'SYSTEM',
          action: 'EMAIL_CODE_REQUESTED',
          targetType: 'EmailAuthCode',
          targetId: id,
          requestId: request.requestId,
          reason: `邮箱验证码请求：${purpose}`,
          source: 'API',
        },
      })
      return { eligible }
    })
    // The same response and timing for known/unknown accounts. SMTP completion
    // is deliberately outside this request; accepted never means delivered.
    if (reservation.eligible) {
      const task = this.deliver(id, normalized, code, purpose, organizationId, request.requestId)
      this.pending.add(task)
      void task.finally(() => this.pending.delete(task))
    }
    return {
      accepted: true,
      retryAfterSeconds: 60,
      expiresInSeconds: 300,
      message: '请求已受理；若该邮箱可用于此操作，将收到验证码，请同时检查垃圾邮件。',
    }
  }

  private async deliver(
    id: string,
    email: string,
    code: string,
    purpose: EmailPurpose,
    organizationId: string,
    requestId: string,
  ): Promise<void> {
    try {
      await this.mail.sendCode(email, code, purpose)
      await this.prisma.emailAuthCode.update({ where: { id }, data: { sendStatus: 'SENT' } })
    } catch {
      this.logger.error('EMAIL_CODE_SEND_FAILED')
      try {
        await this.prisma.$transaction([
          this.prisma.emailAuthCode.update({
            where: { id },
            data: { sendStatus: 'FAILED', consumedAt: new Date() },
          }),
          this.prisma.auditLog.create({
            data: {
              organizationId,
              actorType: 'SYSTEM',
              action: 'EMAIL_CODE_SEND_FAILED',
              targetType: 'EmailAuthCode',
              targetId: id,
              requestId,
              reason: '验证码邮件发送失败',
              source: 'API',
            },
          }),
        ])
      } catch {
        this.logger.error('EMAIL_CODE_FAILURE_RECORD_FAILED')
      }
    }
  }

  async withCode<T>(
    email: string,
    purpose: EmailPurpose,
    organizationId: string,
    code: string | undefined,
    ownerId: string | undefined,
    operation: (tx: Prisma.TransactionClient, userId: string | null) => Promise<T>,
    contextId?: string,
  ): Promise<T> {
    const secret = this.mail.requireConfigured()
    if (!code || !/^\d{6}$/.test(code)) throw invalidCode()
    const normalized = normalizeEmail(email)
    const result = await this.prisma.$transaction(async (tx) => {
      await lockMailbox(tx, normalized)
      const row = await tx.emailAuthCode.findFirst({
        where: {
          organizationId,
          emailNormalized: normalized,
          purpose,
          contextId: contextId ?? null,
          consumedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      })
      if (
        !row ||
        row.sendStatus !== 'SENT' ||
        row.expiresAt.getTime() <= Date.now() ||
        row.attempts >= 5 ||
        (ownerId !== undefined && row.userId !== ownerId)
      )
        return { valid: false } as const
      const expected = Buffer.from(row.codeDigest, 'hex')
      const actual = Buffer.from(
        digest(secret, row.id, normalized, purpose, organizationId, code),
        'hex',
      )
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        // Return instead of throwing, so wrong-attempt increments commit.
        await tx.emailAuthCode.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 } },
        })
        return { valid: false } as const
      }
      const value = await operation(tx, row.userId)
      await tx.emailAuthCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } })
      return { valid: true, value } as const
    })
    if (!result.valid) throw invalidCode()
    return result.value
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}
async function lockMailbox(tx: Prisma.TransactionClient, email: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`xiaoqiu-email:${email}`}))::text`
}
function digest(
  secret: string,
  id: string,
  email: string,
  purpose: string,
  organizationId: string,
  code: string,
): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify([id, email, purpose, organizationId, code]))
    .digest('hex')
}
export function invalidCode() {
  return new ApiHttpException(HttpStatus.BAD_REQUEST, {
    code: ERROR_CODES.BAD_REQUEST,
    message: '验证码无效、已过期或邮箱尚未验证，请重新获取验证码',
  })
}
