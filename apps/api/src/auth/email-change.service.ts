import { Inject, Injectable, HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import { Prisma, type EmailChangeRequest } from '../generated/prisma/client'
import { AuthService, type AuthenticatedSession } from './auth.service'
import { EmailCodeService, normalizeEmail, type EmailRequestContext } from './email-code.service'
import type { EmailChangeCodeDto, EmailChangeVerifyDto } from './email-change.dto'

const conflict = (message: string) =>
  new ApiHttpException(HttpStatus.CONFLICT, { code: ERROR_CODES.CONFLICT, message })
@Injectable()
export class EmailChangeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(EmailCodeService) private readonly codes: EmailCodeService,
  ) {}

  private async current(tx: Prisma.TransactionClient, actor: AuthenticatedSession) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`xiaoqiu-email-change:${actor.sessionId}`}))::text`
    const session = await tx.userSession.findFirst({
      where: {
        id: actor.sessionId,
        userId: actor.userId,
        organizationId: actor.organizationId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        organization: { status: 'ACTIVE' },
        user: {
          status: 'ACTIVE',
          memberships: { some: { organizationId: actor.organizationId, status: 'ACTIVE' } },
        },
      },
      select: { user: { select: { emailNormalized: true } } },
    })
    if (!session)
      throw new ApiHttpException(HttpStatus.UNAUTHORIZED, {
        code: ERROR_CODES.UNAUTHORIZED,
        message: '登录状态已失效，请重新登录',
      })
    return session.user
  }
  private async owned(tx: Prisma.TransactionClient, actor: AuthenticatedSession, id: string) {
    const user = await this.current(tx, actor)
    const row = await tx.emailChangeRequest.findFirst({
      where: {
        id,
        userId: actor.userId,
        organizationId: actor.organizationId,
        sessionId: actor.sessionId,
      },
    })
    if (!row || (!row.completedAt && row.expiresAt.getTime() <= Date.now()))
      throw conflict('邮箱换绑已过期，请重新打开换绑窗口')
    if (
      user.emailNormalized !==
      (row.completedAt ? row.newEmailNormalized : row.previousEmailNormalized)
    )
      throw conflict('邮箱绑定已发生变化，请重新打开换绑窗口')
    return row
  }
  private view(row: EmailChangeRequest) {
    return {
      id: row.id,
      stage: row.completedAt
        ? 'COMPLETED'
        : row.previousEmailNormalized && !row.oldVerifiedAt
          ? 'OLD_EMAIL'
          : 'NEW_EMAIL',
      currentEmail: row.previousEmailNormalized,
      newEmail: row.newEmailNormalized,
      expiresAt: row.expiresAt.toISOString(),
    }
  }
  async start(authorization: string | undefined) {
    const actor = await this.auth.requireSession(authorization)
    return this.prisma.$transaction(async (tx) => {
      const user = await this.current(tx, actor)
      const existing = await tx.emailChangeRequest.findFirst({
        where: {
          userId: actor.userId,
          organizationId: actor.organizationId,
          sessionId: actor.sessionId,
          previousEmailNormalized: user.emailNormalized,
          completedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      })
      if (existing) return this.view(existing)
      const recent = await tx.emailChangeRequest.count({
        where: { userId: actor.userId, createdAt: { gt: new Date(Date.now() - 3600000) } },
      })
      if (recent >= 10)
        throw new ApiHttpException(HttpStatus.TOO_MANY_REQUESTS, {
          code: ERROR_CODES.BAD_REQUEST,
          message: '邮箱换绑操作过于频繁，请稍后再试',
        })
      return this.view(
        await tx.emailChangeRequest.create({
          data: {
            organizationId: actor.organizationId,
            userId: actor.userId,
            sessionId: actor.sessionId,
            previousEmailNormalized: user.emailNormalized,
            expiresAt: new Date(Date.now() + 15 * 60000),
          },
        }),
      )
    })
  }
  async requestCode(
    authorization: string | undefined,
    body: EmailChangeCodeDto,
    request: EmailRequestContext,
  ) {
    const actor = await this.auth.requireSession(authorization)
    const target = await this.prisma.$transaction(async (tx) => {
      const row = await this.owned(tx, actor, body.changeId)
      if (row.completedAt) throw conflict('邮箱换绑已完成')
      if (row.previousEmailNormalized && !row.oldVerifiedAt) {
        if (body.newEmail) throw conflict('请先验证原邮箱')
        return { email: row.previousEmailNormalized, purpose: 'CHANGE_EMAIL_OLD' as const }
      }
      if (!body.newEmail) throw conflict('请输入要绑定的新邮箱')
      const email = normalizeEmail(body.newEmail)
      if (email === row.previousEmailNormalized) throw conflict('新邮箱与原邮箱相同')
      if (
        await tx.user.findFirst({
          where: { emailNormalized: email, id: { not: actor.userId } },
          select: { id: true },
        })
      )
        throw conflict('该邮箱已被其他账号绑定')
      await tx.emailChangeRequest.update({
        where: { id: row.id },
        data: { newEmailNormalized: email, version: { increment: 1 } },
      })
      return { email, purpose: 'CHANGE_EMAIL_NEW' as const }
    })
    return this.codes.requestCode(
      target.email,
      target.purpose,
      actor.organizationId,
      request,
      actor.userId,
      body.changeId,
    )
  }
  async verifyOld(authorization: string | undefined, body: EmailChangeVerifyDto) {
    const actor = await this.auth.requireSession(authorization)
    const row = await this.prisma.$transaction((tx) => this.owned(tx, actor, body.changeId))
    if (row.oldVerifiedAt || !row.previousEmailNormalized) return this.view(row)
    return this.codes.withCode(
      row.previousEmailNormalized,
      'CHANGE_EMAIL_OLD',
      actor.organizationId,
      body.emailCode,
      actor.userId,
      async (tx) => {
        const current = await this.owned(tx, actor, row.id)
        if (current.completedAt) throw conflict('邮箱换绑已完成')
        return this.view(
          await tx.emailChangeRequest.update({
            where: { id: row.id },
            data: { oldVerifiedAt: new Date(), version: { increment: 1 } },
          }),
        )
      },
      row.id,
    )
  }
  async complete(
    authorization: string | undefined,
    body: EmailChangeVerifyDto,
    request: EmailRequestContext,
  ) {
    const actor = await this.auth.requireSession(authorization)
    const row = await this.prisma.$transaction((tx) => this.owned(tx, actor, body.changeId))
    if (!row.completedAt) {
      if ((row.previousEmailNormalized && !row.oldVerifiedAt) || !row.newEmailNormalized)
        throw conflict('请先完成原邮箱验证，再验证新邮箱')
      try {
        await this.codes.withCode(
          row.newEmailNormalized,
          'CHANGE_EMAIL_NEW',
          actor.organizationId,
          body.emailCode,
          actor.userId,
          async (tx) => {
            const current = await this.owned(tx, actor, row.id)
            if (
              current.completedAt ||
              current.newEmailNormalized !== row.newEmailNormalized ||
              (current.previousEmailNormalized && !current.oldVerifiedAt)
            )
              throw conflict('换绑步骤已变化，请重新核对')
            const changed = await tx.user.updateMany({
              where: {
                id: actor.userId,
                status: 'ACTIVE',
                emailNormalized: current.previousEmailNormalized,
              },
              data: {
                email: current.newEmailNormalized,
                emailNormalized: current.newEmailNormalized,
                emailVerifiedAt: new Date(),
              },
            })
            if (changed.count !== 1) throw conflict('原邮箱绑定已变化，请重新打开窗口')
            const claimed = await tx.emailChangeRequest.updateMany({
              where: { id: current.id, version: current.version, completedAt: null },
              data: { completedAt: new Date(), version: { increment: 1 } },
            })
            if (claimed.count !== 1) throw conflict('换绑步骤已变化，请重新核对')
            await tx.userSession.updateMany({
              where: { userId: actor.userId, id: { not: actor.sessionId }, revokedAt: null },
              data: { revokedAt: new Date() },
            })
            await tx.auditLog.create({
              data: {
                organizationId: actor.organizationId,
                actorType: 'USER',
                actorUserId: actor.userId,
                action: 'EMAIL_BINDING_CHANGED',
                targetType: 'User',
                targetId: actor.userId,
                beforeSummary: { email: current.previousEmailNormalized },
                afterSummary: { email: current.newEmailNormalized, changeId: current.id },
                reason: '本人完成旧邮箱与新邮箱验证码验证',
                requestId: request.requestId,
                source: 'API',
              },
            })
            await tx.userNotification.create({
              data: {
                organizationId: actor.organizationId,
                recipientUserId: actor.userId,
                type: 'REPORT_UPDATED',
                title: '邮箱换绑已完成',
                body: '新的邮箱已验证并绑定，其他设备的旧登录会话已退出。',
                deduplicationKey: `email-changed:${current.id}`,
              },
            })
          },
          row.id,
        )
      } catch (error) {
        // A lost response or simultaneous retry may arrive after the same flow committed.
        const current = await this.prisma.$transaction((tx) => this.owned(tx, actor, row.id))
        if (!current.completedAt) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            throw conflict('该邮箱已被其他账号绑定')
          throw error
        }
      }
    }
    return (await this.auth.requireSession(authorization)).user
  }
}
