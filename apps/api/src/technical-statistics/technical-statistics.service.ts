import { Inject, Injectable, type HttpStatus } from '@nestjs/common'
import {
  ERROR_CODES,
  technicalState,
  technicalV2Required,
  technicalV3Required,
  TECHNICAL_TOTAL_KEYS,
  type TechnicalTotals,
  type TechnicalOperation,
} from '@xiaoqiu/contracts'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { AccessPolicyService } from '../auth/access-policy.service'
import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import type { Prisma } from '../generated/prisma/client'
import { requireActiveReporter } from '../campus/reporter-quality.service'
import { MatchReportService } from '../match-report/match-report.service'
import { reportingWindow } from '../match-report/reporting-window'
import { confirmedMatchLineup } from '../experience/confirmed-match-lineup'
import { playerAvatar } from '../media/player-avatar'
import type {
  RecordTechnicalStatisticsDto,
  TechnicalOperationDto,
} from './technical-statistics.dto'

@Injectable()
export class TechnicalStatisticsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(MatchReportService) private readonly reports: MatchReportService,
  ) {}

  private async context(authorization: string | undefined, matchId: string) {
    const session = await this.auth.requireSession(authorization)
    const workspace = await this.reports.get(authorization, matchId)
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, organizationId: session.organizationId },
      include: { homeTeam: true, awayTeam: true },
    })
    if (!match) throw failure(403, '当前比赛不可访问')
    const roster = await this.roster(session.organizationId, match, workspace)
    return { session, workspace, match, roster }
  }
  /**
   * Avatar, position and confirmed-lineup starter flag per team player, for the
   * recorder's player strip. Purely additive: any failure falls back to nulls.
   */
  private async roster(
    organizationId: string,
    match: { id: string; tournamentId: string },
    workspace: {
      homeTeam: { id: string; players: Array<{ id: string }> }
      awayTeam: { id: string; players: Array<{ id: string }> }
    },
  ) {
    const extra = new Map<
      string,
      { avatarUrl: string | null; position: string | null; starter: boolean | null }
    >()
    const teams = [workspace.homeTeam, workspace.awayTeam].filter((team) => team?.id)
    try {
      const ids = [...new Set(teams.flatMap((team) => team.players.map((player) => player.id)))]
      const [profiles, plans] = await Promise.all([
        ids.length
          ? this.prisma.playerProfile.findMany({
              where: { organizationId, id: { in: ids } },
              select: { id: true, position: true, avatarUrl: true, portraitUrl: true },
            })
          : [],
        this.prisma.teamLineupPlan.findMany({
          where: {
            organizationId,
            tournamentId: match.tournamentId,
            matchId: match.id,
            kind: 'MATCH_LINEUP',
            confirmedVersion: { not: null },
            teamId: { in: teams.map((team) => team.id) },
          },
          select: {
            kind: true,
            organizationId: true,
            teamId: true,
            tournamentId: true,
            confirmedVersion: true,
            confirmedAt: true,
            confirmedRevision: {
              select: {
                organizationId: true,
                version: true,
                payload: true,
                rosterSnapshot: {
                  select: {
                    organizationId: true,
                    teamId: true,
                    tournamentId: true,
                    lockedAt: true,
                    entries: {
                      orderBy: { sortOrder: 'asc' },
                      select: {
                        playerProfileId: true,
                        displayName: true,
                        shirtNumber: true,
                        playerProfile: { select: { position: true, avatarUrl: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      ])
      const byId = new Map(profiles.map((profile) => [profile.id, profile]))
      for (const team of teams) {
        const lineup = confirmedMatchLineup(
          plans.find((plan) => plan.teamId === team.id),
          { organizationId, tournamentId: match.tournamentId, teamId: team.id },
        )
        const confirmed = new Map(lineup?.players.map((player) => [player.id, player]) ?? [])
        for (const player of team.players) {
          const profile = byId.get(player.id),
            slot = confirmed.get(player.id)
          extra.set(`${team.id}:${player.id}`, {
            avatarUrl: profile ? playerAvatar(profile) : null,
            position: slot?.position ?? profile?.position ?? null,
            starter: lineup ? (slot?.starter ?? false) : null,
          })
        }
      }
    } catch {
      /* Older clients ignore these fields; never block the recorder on them. */
    }
    return extra
  }
  private async permission(
    tx: Prisma.TransactionClient,
    session: AuthenticatedSession,
    matchId: string,
  ) {
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
    const policy = new AccessPolicyService(tx as PrismaService)
    await policy.requireMatchReporter(fresh, matchId)
    const match = await tx.match.findFirstOrThrow({
      where: { id: matchId, organizationId: session.organizationId },
    })
    let administrator = true
    try {
      await policy.requireTournamentAdministrator(fresh, match.tournamentId)
    } catch (error) {
      if (error instanceof ApiHttpException && error.getStatus() === 403) administrator = false
      else throw error
    }
    if (!administrator) {
      await requireActiveReporter(tx, session.organizationId, session.userId)
      const binding =
        match.confirmedReportVersion === null
          ? null
          : await tx.matchReportRevision.findFirst({
              where: {
                organizationId: session.organizationId,
                matchId: match.id,
                version: match.confirmedReportVersion,
              },
              select: { ruleVersionId: true },
            })
      const rule = await tx.competitionRuleVersion.findFirst({
        where: {
          organizationId: session.organizationId,
          tournamentId: match.tournamentId,
          status: 'PUBLISHED',
          ...(binding ? { id: binding.ruleVersionId } : {}),
        },
        orderBy: { version: 'desc' },
        select: { rules: true },
      })
      const window = reportingWindow(
        match.scheduledStartAt,
        rule?.rules,
        this.clockNow(),
        match.actualEndedAt,
        match.status,
        match.actualStartedAt,
      )
      if (!window) throw failure(403, '请先设置比赛开赛时间')
      if (!window.opened) throw failure(403, '比赛开始前30分钟开放技术统计')
      if (!window.technicalOpen) throw failure(403, '比赛结束已超过30分钟，技术统计请由管理员更正')
    }
    if (
      ['DRAFT', 'CANCELLED', 'POSTPONED'].includes(match.status) ||
      !match.homeTeamId ||
      !match.awayTeamId
    )
      throw failure(403, '当前比赛尚不能记录技术统计')
  }
  private clockNow() {
    return Date.now()
  }
  private response(
    context: Awaited<ReturnType<TechnicalStatisticsService['context']>>,
    record: { version: number; operations: unknown } | null,
    reason: string | null,
  ) {
    const { session, workspace: w } = context
    return {
      matchId: w.matchId,
      tournamentId: context.match.tournamentId,
      title: w.title,
      recorderUserId: session.userId,
      canRecord: !reason,
      reason,
      version: record?.version || 0,
      operations: (record?.operations || []) as TechnicalOperation[],
      teams: [w.homeTeam, w.awayTeam].map((team) => ({
        id: team.id,
        name: team.name,
        shortName:
          [context.match.homeTeam, context.match.awayTeam].find((x) => x?.id === team.id)
            ?.shortName || team.name,
        players: team.players.map((player) => ({
          ...player,
          avatarUrl: null,
          position: null,
          starter: null,
          ...context.roster.get(`${team.id}:${player.id}`),
        })),
      })),
    }
  }
  async get(auth: string | undefined, matchId: string, schemaVersion = 1) {
    const context = await this.context(auth, matchId.toLowerCase())
    let reason: string | null = null
    try {
      await this.prisma.$transaction((tx) =>
        this.permission(tx, context.session, context.workspace.matchId),
      )
    } catch (error) {
      if (error instanceof ApiHttpException && error.getStatus() === 403)
        reason = (error.getResponse() as { message: string }).message
      else throw error
    }
    const record = await this.prisma.matchTechnicalLog.findUnique({
      where: {
        organizationId_matchId_recorderUserId: {
          organizationId: context.session.organizationId,
          matchId: context.workspace.matchId,
          recorderUserId: context.session.userId,
        },
      },
    })
    if (
      schemaVersion < 2 &&
      technicalV2Required((record?.operations || []) as TechnicalOperation[])
    )
      throw failure(409, '这场已有新版技术记录，请更新到0.7.1或更新版本后查看')
    if (
      schemaVersion < 3 &&
      technicalV3Required((record?.operations || []) as TechnicalOperation[])
    )
      throw failure(409, '这场包含角球记录，请更新到0.9.0或更新版本后查看')
    return this.response(context, record, reason)
  }
  async record(
    auth: string | undefined,
    matchId: string,
    body: RecordTechnicalStatisticsDto,
    requestId: string,
  ) {
    const context = await this.context(auth, matchId.toLowerCase()),
      { session, workspace } = context
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM matches WHERE id=${workspace.matchId}::uuid AND organization_id=${session.organizationId}::uuid FOR UPDATE`
        await this.permission(tx, session, workspace.matchId)
        const where = {
          organizationId_matchId_recorderUserId: {
            organizationId: session.organizationId,
            matchId: workspace.matchId,
            recorderUserId: session.userId,
          },
        }
        const previous = await tx.matchTechnicalLog.findUnique({ where })
        const operations = (previous?.operations || []) as TechnicalOperation[]
        if ((body.schemaVersion ?? 1) < 2 && technicalV2Required(operations))
          throw failure(409, '这场已有新版技术记录，请更新小程序后继续')
        if ((body.schemaVersion ?? 1) < 3 && technicalV3Required(operations))
          throw failure(409, '这场包含角球记录，请更新到0.9.0或更新版本后继续')
        const known = new Map(operations.map((op) => [op.id, op]))
        const append: TechnicalOperation[] = []
        for (const item of body.operations) {
          const operation = normalize(item)
          if ((body.schemaVersion ?? 1) < 2 && technicalV2Required([operation]))
            throw failure(409, '请更新小程序后使用新版技术记录')
          if ((body.schemaVersion ?? 1) < 3 && technicalV3Required([operation]))
            throw failure(409, '请更新到0.9.0或更新版本后记录角球')
          const existing = known.get(operation.id)
          if (existing) {
            if (
              JSON.stringify(normalize(existing as TechnicalOperationDto)) !==
              JSON.stringify(operation)
            )
              throw failure(409, '操作编号已用于另一条统计记录')
            continue
          }
          if (operation.kind === 'COUNT' || operation.kind === 'SET_TOTALS') {
            const team = [workspace.homeTeam, workspace.awayTeam].find(
              (t) => t.id === operation.teamId,
            )
            if (
              !team ||
              (operation.playerId && !team.players.some((p) => p.id === operation.playerId))
            )
              throw failure(400, '球队或球员不在本场比赛名单中')
          }
          known.set(operation.id, operation)
          append.push(operation)
        }
        if (!append.length) return this.response(context, previous, null)
        if ((previous?.version || 0) !== body.expectedVersion)
          throw failure(409, '另一设备更新了统计，请刷新后重试；本机记录仍保留')
        if (operations.length + append.length > 20000)
          throw failure(400, '本场操作记录过多，请联系管理员整理')
        const combined = [...operations, ...append]
        try {
          technicalState(combined)
        } catch (error) {
          throw failure(409, error instanceof Error ? error.message : '统计操作冲突')
        }
        const record = await tx.matchTechnicalLog.upsert({
          where,
          create: {
            ...where.organizationId_matchId_recorderUserId,
            version: 1,
            operations: combined as unknown as Prisma.InputJsonValue,
          },
          update: {
            version: { increment: 1 },
            operations: combined as unknown as Prisma.InputJsonValue,
          },
        })
        await tx.auditLog.create({
          data: {
            organizationId: session.organizationId,
            actorType: 'USER',
            actorUserId: session.userId,
            action: 'MATCH_TECHNICAL_RECORDED',
            targetType: 'MatchTechnicalLog',
            targetId: record.id,
            afterSummary: {
              matchId: workspace.matchId,
              version: record.version,
              operationIds: append.map((x) => x.id),
            },
            reason: append.some((x) => x.kind === 'UNDO')
              ? '撤销误触技术记录'
              : append
                  .filter((x) => x.kind === 'SET_TOTALS')
                  .map((x) => x.reason?.trim() || '现场汇总补录')
                  .join('；')
                  .slice(0, 240) || null,
            requestId,
            source: 'TECHNICAL_COUNTER',
          },
        })
        return this.response(context, record, null)
      },
      { timeout: 15000 },
    )
  }
}
function normalize(op: TechnicalOperationDto): TechnicalOperation {
  const base = { id: op.id.toLowerCase(), occurredAt: new Date(op.occurredAt).toISOString() }
  if (op.kind === 'COUNT' && op.teamId && op.metric && op.outcome)
    return {
      ...base,
      kind: 'COUNT',
      teamId: op.teamId.toLowerCase(),
      playerId: op.playerId?.toLowerCase() || null,
      metric: op.metric,
      outcome: op.outcome,
    }
  if (op.kind === 'GOAL' && op.shotId)
    return { ...base, kind: 'GOAL', shotId: op.shotId.toLowerCase() }
  if (op.kind === 'UNDO' && op.targetId)
    return { ...base, kind: 'UNDO', targetId: op.targetId.toLowerCase() }
  if (op.kind === 'SET_TOTALS' && op.teamId && op.totals)
    return {
      ...base,
      kind: 'SET_TOTALS',
      teamId: op.teamId.toLowerCase(),
      playerId: op.playerId?.toLowerCase() || null,
      totals: Object.fromEntries(
        TECHNICAL_TOTAL_KEYS.map((key) => [
          key,
          key === 'corners' ? (op.totals!.corners ?? 0) : op.totals![key],
        ]),
      ) as TechnicalTotals,
      ...(op.reason?.trim() ? { reason: op.reason.trim() } : {}),
    }
  throw failure(400, '统计操作缺少必要信息')
}
function failure(status: 400 | 403 | 409, message: string) {
  return new ApiHttpException(status as HttpStatus, {
    code:
      status === 403
        ? ERROR_CODES.FORBIDDEN
        : status === 409
          ? ERROR_CODES.CONFLICT
          : ERROR_CODES.BAD_REQUEST,
    message,
  })
}
