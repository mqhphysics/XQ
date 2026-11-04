import { Inject, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { isUUID } from 'class-validator'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { PrismaService } from '../database/prisma.service'
import type { Prisma } from '../generated/prisma/client'
import { centerError } from '../admin-center/admin-center.policy'
import { assertCaptainCapacity } from '../roster/captain-limit'
import { fixedCaptainFacts } from '../common/official-personnel'
import type {
  GettingStartedActionDto,
  GettingStartedCompleteDto,
  GettingStartedPlayerClaimDto,
} from './getting-started.dto'
type Tx = Prisma.TransactionClient
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
@Injectable()
export class GettingStartedService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async candidates(tx: Tx, actor: AuthenticatedSession) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } })
    if (user.playerProfileId) return []
    let declared = user.studentId || ''
    if (!/^20\d{8}$/.test(declared)) {
      const submitted = await tx.identityApplication.findFirst({
        where: {
          organizationId: actor.organizationId,
          userId: actor.userId,
          kind: 'STUDENT_REGISTRATION',
        },
        orderBy: { createdAt: 'desc' },
        select: { message: true },
      })
      try {
        declared = JSON.parse(submitted?.message || '{}').studentNumber || ''
      } catch {
        /* Older accounts can still use their directory link. */
      }
    }
    if (!user.studentRecordId && (!user.realName || !/^20\d{8}$/.test(declared))) return []
    const rows = await tx.studentRecord.findMany({
      where: {
        organizationId: actor.organizationId,
        status: 'ACTIVE',
        ...(user.studentRecordId
          ? { id: user.studentRecordId }
          : {
              realName: {
                equals: user.realName!.normalize('NFKC').trim(),
                mode: 'insensitive' as const,
              },
            }),
      },
      include: {
        user: { select: { id: true } },
        player: {
          include: {
            linkedUser: { select: { id: true } },
            teamMemberships: {
              where: { organizationId: actor.organizationId, status: 'ACTIVE' },
              select: { team: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: 20,
    })
    const normalizedName = (value: string) => value.normalize('NFKC').trim().toLowerCase()
    const available = rows.filter(
      (row) =>
        (!!user.studentRecordId ||
          (normalizedName(row.realName) === normalizedName(user.realName || '') &&
            (!row.studentNumber || row.studentNumber === declared))) &&
        (!row.user || row.user.id === actor.userId) &&
        row.player &&
        (!row.player.linkedUser || row.player.linkedUser.id === actor.userId),
    )
    const exact = available.filter((row) => row.studentNumber && row.studentNumber === declared)
    return (exact.length ? exact : available).map((row) => ({
      studentId: row.id,
      player: row.player!,
      collegeName: row.collegeName,
      academicYear: row.academicYear,
    }))
  }
  /** The signed document's stored player ID is the fixed team captain source requested by the owner. */
  private async captainFacts(tx: Tx, organizationId: string) {
    const fixed = await fixedCaptainFacts(tx, organizationId)
    const logs = await tx.auditLog.findMany({
      where: {
        organizationId,
        action: 'MATCH_DOCUMENT_LINEUP_RECORDED',
        targetType: 'Match',
        source: 'OFFICIAL_MATCH_DOCUMENT',
        actorType: 'ADMIN',
      },
      orderBy: { createdAt: 'desc' },
      take: 4000,
      select: { id: true, targetId: true, actorUserId: true, afterSummary: true, createdAt: true },
    })
    const matches = await tx.match.findMany({
      where: {
        organizationId,
        id: { in: [...new Set(logs.map((log) => log.targetId).filter((id) => isUUID(id)))] },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
      },
      select: {
        id: true,
        tournamentId: true,
        homeTeamId: true,
        awayTeamId: true,
        scheduledStartAt: true,
      },
    })
    const byId = new Map(matches.map((match) => [match.id, match]))
    const ordered = logs
      .filter((log) => byId.has(log.targetId))
      .sort(
        (a, b) =>
          (byId.get(b.targetId)!.scheduledStartAt?.getTime() || 0) -
            (byId.get(a.targetId)!.scheduledStartAt?.getTime() || 0) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      )
    const facts = new Map<
      string,
      { teamId: string; playerId: string; matchId: string; auditId: string }
    >()
    for (const log of ordered) {
      const data = log.afterSummary,
        match = byId.get(log.targetId)!
      if (
        !object(data) ||
        data.matchId !== match.id ||
        data.tournamentId !== match.tournamentId ||
        typeof data.teamId !== 'string' ||
        ![match.homeTeamId, match.awayTeamId].includes(data.teamId) ||
        !object(data.lineup) ||
        typeof data.lineup.captainPlayerId !== 'string' ||
        !isUUID(data.lineup.captainPlayerId) ||
        facts.has(data.teamId)
      )
        continue
      facts.set(data.teamId, {
        teamId: data.teamId,
        playerId: data.lineup.captainPlayerId,
        matchId: match.id,
        auditId: log.id,
      })
    }
    const membership = await tx.teamMembership.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        teamId: { in: [...facts.keys()] },
        playerProfileId: { in: [...facts.values()].map((f) => f.playerId) },
      },
      select: { teamId: true, playerProfileId: true },
    })
    return [...fixed, ...[...facts.values()].filter((f) => !fixed.some(item => item.teamId === f.teamId)).filter((f) =>
      membership.some((m) => m.teamId === f.teamId && m.playerProfileId === f.playerId),
    )]
  }
  private async inherit(tx: Tx, actor: AuthenticatedSession, requestId: string) {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { playerProfileId: true },
    })
    if (!user.playerProfileId) return []
    const facts = (await this.captainFacts(tx, actor.organizationId)).filter(
      (f) => f.playerId === user.playerProfileId,
    )
    if (actor.user.roles.some((role) => role.role === 'PLATFORM_ADMIN')) return []
    const added: string[] = []
    for (const fact of facts) {
      const where = {
        userId_role_scopeType_scopeId: {
          userId: actor.userId,
          role: 'TEAM_CAPTAIN' as const,
          scopeType: 'TEAM' as const,
          scopeId: fact.teamId,
        },
      }
      const old = await tx.roleAssignment.findUnique({ where })
      if (old && !old.revokedAt) continue
      // An explicit administrative revocation is not silently undone by an automatic match.
      if (old?.revokedAt) continue
      await assertCaptainCapacity(tx, actor.organizationId, fact.teamId, actor.userId)
      const assignment = await tx.roleAssignment.create({
        data: {
          organizationId: actor.organizationId,
          userId: actor.userId,
          role: 'TEAM_CAPTAIN',
          scopeType: 'TEAM',
          scopeId: fact.teamId,
        },
      })
      await this.audit(tx, actor, 'TEAM_CAPTAIN_INHERITED', assignment.id, requestId, {
        teamId: fact.teamId,
        playerId: fact.playerId,
        sourceMatchId: fact.matchId,
        sourceAuditId: fact.auditId,
      })
      added.push(fact.teamId)
    }
    return added
  }
  async read(auth: string | undefined, newlyInheritedTeamIds: string[] = []) {
    const actor = await this.auth.requireSession(auth)
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
          where: { id: actor.userId },
          select: { onboardingCompletedAt: true, playerProfileId: true },
        }),
        players = await this.candidates(tx, actor)
      const facts =
        user.playerProfileId && actor.user.roles.some((role) => role.role === 'PLATFORM_ADMIN')
          ? (await this.captainFacts(tx, actor.organizationId)).filter(
              (fact) => fact.playerId === user.playerProfileId,
            )
          : []
      const ids = [
        ...new Set([
          ...actor.user.roles
            .filter((role) => role.role === 'TEAM_CAPTAIN' && role.scopeType === 'TEAM')
            .map((role) => role.scopeId),
          ...facts.map((fact) => fact.teamId),
        ]),
      ]
      const captainTeams = await tx.team.findMany({
        where: { organizationId: actor.organizationId, id: { in: ids } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
      return {
        user: actor.user,
        completed: !!user.onboardingCompletedAt,
        players: players.map((row) => ({
          id: row.player.id,
          name: row.player.displayName,
          avatarUrl: row.player.avatarUrl,
          portraitUrl: row.player.portraitUrl,
          collegeName: row.collegeName,
          academicYear: row.academicYear,
          teamNames: row.player.teamMemberships.map((m) => m.team.name),
        })),
        captainTeams,
        newlyInheritedTeamIds,
      }
    })
  }
  async match(auth: string | undefined, body: GettingStartedActionDto, requestId: string) {
    const added = await this.write(auth, 'match', body, requestId, (tx, actor) =>
      this.inherit(tx, actor, requestId),
    )
    return this.read(auth, added as string[])
  }
  async claim(auth: string | undefined, body: GettingStartedPlayerClaimDto, requestId: string) {
    const added = await this.write(auth, 'player', body, requestId, async (tx, actor) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } })
      if (user.playerProfileId && user.playerProfileId !== body.playerId)
        throw centerError(409, '当前账号已经关联其他球员，不会覆盖原关联')
      if (!user.playerProfileId) {
        const matched = (await this.candidates(tx, actor)).find(
          (candidate) => candidate.player.id === body.playerId,
        )
        if (!matched) throw centerError(409, '该档案已变化或不在你的匹配结果中，请重新匹配')
        await tx.$queryRaw`SELECT id FROM player_profiles WHERE id=${body.playerId}::uuid FOR UPDATE`
        if (
          await tx.user.findFirst({
            where: { playerProfileId: body.playerId, id: { not: actor.userId } },
            select: { id: true },
          })
        )
          throw centerError(409, '这份球员档案已有关联账号，原资料会保留，请从我的提交问题反馈')
        await tx.user.update({
          where: { id: actor.userId },
          data: {
            playerProfileId: body.playerId,
            studentRecordId: matched.studentId,
            verificationLevel: 'PLAYER_CONFIRMED',
            playerOfferDismissedAt: new Date(),
          },
        })
        await this.audit(tx, actor, 'PLAYER_SELF_ASSOCIATED', body.playerId, requestId, {
          studentRecordId: matched.studentId,
        })
      }
      return this.inherit(tx, actor, requestId)
    })
    return this.read(auth, added as string[])
  }
  async complete(auth: string | undefined, body: GettingStartedCompleteDto, requestId: string) {
    await this.write(auth, 'complete', body, requestId, async (tx, actor) => {
      await tx.user.updateMany({
        where: { id: actor.userId, onboardingCompletedAt: null },
        data: { onboardingCompletedAt: new Date() },
      })
      await this.audit(tx, actor, 'GETTING_STARTED_COMPLETED', actor.userId, requestId, {
        outcome: body.outcome,
      })
      return { saved: true }
    })
    return { saved: true }
  }
  private async write(
    auth: string | undefined,
    suffix: string,
    body: GettingStartedActionDto,
    requestId: string,
    run: (tx: Tx, actor: AuthenticatedSession) => Promise<unknown>,
  ) {
    const actor = await this.auth.requireSession(auth),
      route = 'POST /me/getting-started/' + suffix,
      hash = createHash('sha256').update(JSON.stringify(body)).digest('hex')
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM app_users WHERE id=${actor.userId}::uuid FOR UPDATE`
        const where = {
            userId_route_idempotencyKey: {
              userId: actor.userId,
              route,
              idempotencyKey: body.clientActionId,
            },
          },
          previous = await tx.idempotencyRecord.findUnique({ where })
        if (previous) {
          if (previous.requestHash !== hash || previous.organizationId !== actor.organizationId)
            throw centerError(409, '操作编号已用于其他请求')
          return previous.responseBody
        }
        const result = await run(tx, actor)
        await tx.idempotencyRecord.create({
          data: {
            organizationId: actor.organizationId,
            userId: actor.userId,
            route,
            idempotencyKey: body.clientActionId,
            requestHash: hash,
            responseStatus: 200,
            responseBody: result as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 30 * 86400000),
          },
        })
        return result
      },
      { timeout: 15000 },
    )
  }
  private audit(
    tx: Tx,
    actor: AuthenticatedSession,
    action: string,
    targetId: string,
    requestId: string,
    afterSummary: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorType: 'USER',
        actorUserId: actor.userId,
        action,
        targetType: 'GettingStarted',
        targetId,
        requestId,
        source: 'GETTING_STARTED',
        reason: '本人确认与已确认四官表队长身份继承',
        afterSummary,
      },
    })
  }
}
