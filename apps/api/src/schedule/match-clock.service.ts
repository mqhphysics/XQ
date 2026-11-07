import {
  type HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { PrismaService } from '../database/prisma.service'
import { AuthService } from '../auth/auth.service'
import { AccessPolicyService } from '../auth/access-policy.service'
import { requireActiveReporter } from '../campus/reporter-quality.service'
import { ApiHttpException } from '../common/api-http.exception'
import type { Prisma } from '../generated/prisma/client'
import {
  AUTO_START_GRACE_MS,
  clockAdministrator,
  clockStartPermission,
  matchClockView,
  type ClockMatch,
} from './match-clock.logic'

@Injectable()
export class MatchClockService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>
  private running = false
  private readonly logger = new Logger(MatchClockService.name)
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    void this.tick()
    this.timer = setInterval(() => void this.tick(), 15000)
    this.timer.unref()
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }
  private clockNow() {
    return Date.now()
  }
  private async rules(
    client: Prisma.TransactionClient,
    match: ClockMatch & { confirmedReportVersion?: number | null },
  ) {
    const binding =
      match.confirmedReportVersion == null
        ? null
        : await client.matchReportRevision.findFirst({
            where: {
              organizationId: match.organizationId,
              matchId: match.id,
              version: match.confirmedReportVersion,
            },
            select: { ruleVersionId: true },
          })
    const rule = await client.competitionRuleVersion.findFirst({
      where: {
        organizationId: match.organizationId,
        tournamentId: match.tournamentId,
        status: 'PUBLISHED',
        ...(binding ? { id: binding.ruleVersionId } : {}),
      },
      orderBy: { version: 'desc' },
      select: { rules: true },
    })
    return rule?.rules
  }
  async read(organizationId: string, matchId: string, authorization?: string) {
    const session = await this.auth.getSession(authorization)
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        organizationId,
        status: { not: 'DRAFT' },
        tournament: { organizationId, status: 'PUBLISHED' },
      },
    })
    if (!match) throw failure(404, '比赛不存在')
    const now = this.clockNow()
    let permitted = clockStartPermission(session, match, now)
    if (permitted && session && !clockAdministrator(session, match)) {
      try {
        await requireActiveReporter(this.prisma, organizationId, session.userId)
      } catch (error) {
        if (error instanceof ApiHttpException && error.getStatus() === 403) permitted = false
        else throw error
      }
    }
    return matchClockView(match, await this.rules(this.prisma, match), now, permitted)
  }
  async start(
    authorization: string | undefined,
    matchId: string,
    clientActionId: string,
    requestId: string,
  ) {
    const session = await this.auth.requireSession(authorization)
    const route = `POST /matches/${matchId}/start`,
      requestHash = createHash('sha256')
        .update(`${session.organizationId}:${matchId}`)
        .digest('hex')
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM matches WHERE id=${matchId}::uuid AND organization_id=${session.organizationId}::uuid FOR UPDATE`
      const match = await tx.match.findFirst({
        where: { id: matchId, organizationId: session.organizationId },
      })
      if (!match) throw failure(404, '比赛不存在')
      const member = await tx.organizationMembership.findFirst({
        where: {
          organizationId: session.organizationId,
          userId: session.userId,
          status: 'ACTIVE',
          user: { status: 'ACTIVE' },
          organization: { status: 'ACTIVE' },
        },
        select: { id: true },
      })
      if (!member) throw failure(403, '账号或组织已不可用')
      const roles = await tx.roleAssignment.findMany({
        where: {
          userId: session.userId,
          revokedAt: null,
          grantedAt: { lte: new Date() },
          OR: [
            { organizationId: session.organizationId },
            { organizationId: null, role: 'PLATFORM_ADMIN' },
          ],
        },
        select: { role: true, scopeType: true, scopeId: true },
      })
      const fresh = { ...session, user: { ...session.user, roles } }
      await new AccessPolicyService(tx as PrismaService).requireMatchReporter(fresh, matchId)
      const administrator = clockAdministrator(fresh, match)
      if (!administrator) await requireActiveReporter(tx, session.organizationId, session.userId)
      const now = this.clockNow(),
        rules = await this.rules(tx, match)
      const previous = await tx.idempotencyRecord.findUnique({
        where: {
          userId_route_idempotencyKey: {
            userId: session.userId,
            route,
            idempotencyKey: clientActionId,
          },
        },
      })
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw failure(409, '开始比赛的请求编号已用于其他操作')
        return matchClockView(match, rules, now, false)
      }
      if (['DRAFT', 'CANCELLED', 'POSTPONED'].includes(match.status))
        throw failure(403, '比赛未发布、已延期或取消，不能开始计时')
      const initial = matchClockView(match, rules, now, clockStartPermission(fresh, match, now))
      if (initial.startSource === 'PENDING' && initial.phase !== 'FINISHED' && !initial.canStart)
        throw failure(403, '比赛开始前30分钟才能手动开始')
      let changed = match
      if (initial.canStart) {
        changed = await tx.match.update({
          where: { id: match.id },
          data: { actualStartedAt: new Date(now), status: 'LIVE' },
        })
        await tx.auditLog.create({
          data: {
            organizationId: session.organizationId,
            actorType: administrator ? 'ADMIN' : 'MATCH_REPORTER',
            actorUserId: session.userId,
            actorRoleSnapshot: roles.map((role) => ({ ...role })),
            action: 'MATCH_CLOCK_STARTED',
            targetType: 'Match',
            targetId: match.id,
            afterSummary: { startedAt: new Date(now).toISOString(), startSource: 'MANUAL' },
            requestId,
            source: 'MATCH_CLOCK',
            reason: '现场确认比赛开始',
          },
        })
      }
      const response = matchClockView(changed, rules, now, false)
      await tx.idempotencyRecord.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          route,
          idempotencyKey: clientActionId,
          requestHash,
          responseBody: response as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(now + 86400000),
        },
      })
      return response
    })
  }
  async tick(now = new Date()) {
    if (this.running) return
    this.running = true
    try {
      const matches = await this.prisma.match.findMany({
        where: {
          status: { in: ['SCHEDULED', 'LIVE'] },
          OR: [
            { actualStartedAt: { not: null } },
            { scheduledStartAt: { lte: new Date(now.getTime() - AUTO_START_GRACE_MS) } },
          ],
          homeTeamId: { not: null },
          awayTeamId: { not: null },
          tournament: { status: 'PUBLISHED', organization: { status: 'ACTIVE' } },
        },
        select: {
          id: true,
          organizationId: true,
          tournamentId: true,
          status: true,
          scheduledStartAt: true,
          actualStartedAt: true,
          actualEndedAt: true,
          confirmedReportVersion: true,
        },
      })
      if (!matches.length) return
      for (const match of matches) {
        const clock = matchClockView(match, await this.rules(this.prisma, match), now.getTime())
        if (clock.phase === 'PENDING' || clock.phase === 'UNAVAILABLE') continue
        const status = clock.phase === 'FINISHED' ? 'FINISHED' : 'LIVE'
        if (status === match.status) continue
        await this.prisma.match.updateMany({
          where: {
            id: match.id,
            status: match.status,
            scheduledStartAt: match.scheduledStartAt,
            actualStartedAt: match.actualStartedAt,
            actualEndedAt: match.actualEndedAt,
          },
          data: { status },
        })
      }
    } catch (error) {
      this.logger.error('比赛时间状态更新失败', error)
    } finally {
      this.running = false
    }
  }
}

function failure(status: 403 | 404 | 409, message: string) {
  return new ApiHttpException(status as HttpStatus, {
    code:
      status === 404
        ? ERROR_CODES.NOT_FOUND
        : status === 409
          ? ERROR_CODES.CONFLICT
          : ERROR_CODES.FORBIDDEN,
    message,
  })
}
