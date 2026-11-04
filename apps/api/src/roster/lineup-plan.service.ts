import { createHash, randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { AuthService } from '../auth/auth.service'
import { PrismaService } from '../database/prisma.service'
import { Prisma } from '../generated/prisma/client'
import type { LineupPlanCommandDto, SaveLineupPlanDto } from './lineup-plan.dto'
import { validateLineupPlan } from './lineup-plan.rules'
import { rosterError } from './roster-workflow.rules'
import { RosterWorkflowService } from './roster-workflow.service'

const planInclude = {
  rosterSnapshot: {
    include: {
      entries: {
        orderBy: { sortOrder: 'asc' as const },
        include: { playerProfile: { select: { avatarUrl: true, position: true } } },
      },
    },
  },
} satisfies Prisma.TeamLineupPlanInclude
type SnapshotPlayer = {
  playerProfileId: string
  displayName: string
  shirtNumber: string | null
  playerProfile: { avatarUrl: string | null; position: string | null }
}

@Injectable()
export class LineupPlanService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(RosterWorkflowService) private readonly access: RosterWorkflowService,
  ) {}

  async list(authorization: string | undefined, teamId: string) {
    const actor = await this.auth.requireSession(authorization)
    return this.prisma.$transaction(async (tx) => {
      await this.access.authorize(tx, actor, '', teamId, false)
      await this.requireTeam(tx, actor.organizationId, teamId)
      const plans = await tx.teamLineupPlan.findMany({
        include: planInclude,
        where: { organizationId: actor.organizationId, teamId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: 100,
      })
      return { items: plans.map((plan) => this.view(plan)) }
    })
  }

  async history(
    authorization: string | undefined,
    teamId: string,
    planId: string,
    beforeVersion?: number,
  ) {
    const actor = await this.auth.requireSession(authorization)
    if (beforeVersion !== undefined && beforeVersion < 1)
      throw rosterError(400, '历史版本游标必须大于零')
    return this.prisma.$transaction(async (tx) => {
      await this.access.authorize(tx, actor, '', teamId, false)
      const plan = await tx.teamLineupPlan.findFirst({
        include: planInclude,
        where: { id: planId, organizationId: actor.organizationId, teamId },
      })
      if (!plan) throw rosterError(404, '战术计划不存在')
      const revisions = await tx.teamLineupRevision.findMany({
        where: {
          organizationId: actor.organizationId,
          planId,
          ...(beforeVersion ? { version: { lt: beforeVersion } } : {}),
        },
        orderBy: { version: 'desc' },
        take: 51,
      })
      return {
        plan: this.view(plan),
        items: revisions.slice(0, 50).map((revision) => ({
          version: revision.version,
          payload: revision.payload,
          createdAt: revision.createdAt.toISOString(),
        })),
        nextBeforeVersion: revisions.length > 50 ? revisions[49]!.version : null,
      }
    })
  }

  async save(
    authorization: string | undefined,
    teamId: string,
    input: SaveLineupPlanDto,
    key: string | undefined,
    requestId: string,
  ) {
    const actor = await this.auth.requireSession(authorization)
    if (!key || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
      throw rosterError(400, '请提供有效 Idempotency-Key')
    const playerIds = validateLineupPlan(input)
    const route = `/captain/teams/${teamId}/lineup-plans`
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ organizationId: actor.organizationId, input }))
      .digest('hex')
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await this.access.authorize(tx, actor, '', teamId, false)
            await this.requireTeam(tx, actor.organizationId, teamId)
            await tx.$queryRaw`SELECT id FROM teams WHERE id = ${teamId}::uuid AND organization_id = ${actor.organizationId}::uuid FOR UPDATE`
            const previous = await tx.idempotencyRecord.findUnique({
              where: {
                userId_route_idempotencyKey: { userId: actor.userId, route, idempotencyKey: key },
              },
            })
            if (previous) {
              if (
                previous.organizationId !== actor.organizationId ||
                previous.requestHash !== requestHash ||
                previous.responseBody === null
              )
                throw rosterError(409, '同一幂等键不能重复用于不同战术保存')
              return previous.responseBody
            }
            const plan = input.planId
              ? await tx.teamLineupPlan.findFirst({
                  where: { id: input.planId, organizationId: actor.organizationId, teamId },
                })
              : null
            if (input.planId && !plan) throw rosterError(404, '战术计划不存在')
            if ((plan?.version ?? 0) !== input.expectedVersion)
              throw rosterError(409, '战术计划已被其他人更新，请读取最新版本后再保存')
            if (
              plan &&
              (plan.kind !== input.kind ||
                plan.matchId !== (input.matchId ?? null) ||
                plan.tournamentId !== (input.tournamentId ?? null))
            )
              throw rosterError(409, '已保存计划的类型与赛事绑定不可修改，请另建计划')
            await this.validateContext(tx, actor.organizationId, teamId, input, playerIds)
            const version = input.expectedVersion + 1
            const payload = {
              ...input.payload,
              slots: input.payload.slots.map((slot) => ({
                ...slot,
                playerId: slot.playerId ?? null,
              })),
            } as unknown as Prisma.InputJsonValue
            const data = {
              name: input.name.trim(),
              kind: input.kind,
              tournamentId: input.tournamentId ?? null,
              matchId: input.matchId ?? null,
              rosterSnapshotId: input.rosterSnapshotId ?? null,
              version,
              payload,
            }
            const id = plan?.id ?? randomUUID()
            if (plan) {
              const updated = await tx.teamLineupPlan.updateMany({
                where: {
                  id,
                  organizationId: actor.organizationId,
                  teamId,
                  version: input.expectedVersion,
                },
                data,
              })
              if (updated.count !== 1) throw rosterError(409, '战术已更新，请重新读取')
            } else
              await tx.teamLineupPlan.create({
                data: { id, organizationId: actor.organizationId, teamId, ...data },
              })
            await tx.teamLineupRevision.create({
              data: {
                organizationId: actor.organizationId,
                planId: id,
                version,
                rosterSnapshotId: input.rosterSnapshotId ?? null,
                createdByUserId: actor.userId,
                payload: {
                  name: data.name,
                  kind: data.kind,
                  tournamentId: data.tournamentId,
                  matchId: data.matchId,
                  rosterSnapshotId: data.rosterSnapshotId,
                  lineup: payload,
                },
              },
            })
            await tx.auditLog.create({
              data: {
                organizationId: actor.organizationId,
                actorType: 'USER',
                actorUserId: actor.userId,
                action: 'TEAM_LINEUP_SAVED',
                targetType: 'TeamLineupPlan',
                targetId: id,
                beforeSummary: { version: input.expectedVersion },
                afterSummary: { version, kind: input.kind, matchId: input.matchId ?? null },
                requestId,
                source: 'roster-workflow',
              },
            })
            const result = this.view(
              await tx.teamLineupPlan.findFirstOrThrow({
                include: planInclude,
                where: { id, organizationId: actor.organizationId, teamId },
              }),
            )
            await tx.idempotencyRecord.create({
              data: {
                organizationId: actor.organizationId,
                userId: actor.userId,
                route,
                idempotencyKey: key,
                requestHash,
                responseStatus: 200,
                responseBody: JSON.parse(JSON.stringify(result)),
                resourceType: 'TeamLineupPlan',
                resourceId: id,
                expiresAt: new Date(Date.now() + 7 * 86400000),
              },
            })
            return result
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 15000,
          },
        )
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 2) continue
          throw rosterError(409, '战术计划正在被更新，请用原保存请求重试')
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          if (attempt < 2) continue
          throw rosterError(409, '本队已存在同名战术，请读取已有计划或使用其他名称')
        }
        throw error
      }
    }
    throw rosterError(409, '战术保存冲突，请用原请求重试')
  }

  private async requireTeam(tx: Prisma.TransactionClient, organizationId: string, teamId: string) {
    if (!(await tx.team.findFirst({ where: { id: teamId, organizationId }, select: { id: true } })))
      throw rosterError(404, '球队不存在')
  }

  private async validateContext(
    tx: Prisma.TransactionClient,
    organizationId: string,
    teamId: string,
    input: SaveLineupPlanDto,
    playerIds: string[],
    confirming = false,
  ) {
    if (input.tournamentId) {
      const registration = await tx.teamRegistration.findFirst({
        where: {
          organizationId,
          tournamentId: input.tournamentId,
          teamId,
          status: { notIn: ['WITHDRAWN', 'SUSPENDED'] },
        },
      })
      if (!registration) throw rosterError(404, '本队没有该赛事的有效报名')
    }
    if (input.kind === 'MATCH_LINEUP') {
      const match = await tx.match.findFirst({
        where: {
          id: input.matchId!,
          organizationId,
          tournamentId: input.tournamentId!,
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        },
      })
      if (!match) throw rosterError(404, '比赛不属于本组织本队的该赛事')
      await tx.$queryRaw`SELECT id FROM matches WHERE id = ${match.id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`
      if (!['DRAFT', 'SCHEDULED', 'POSTPONED'].includes(match.status))
        throw rosterError(409, '比赛已开始或结束，不能修改赛前阵容')
      const rule = await tx.competitionRuleVersion.findFirst({
        where: { organizationId, tournamentId: input.tournamentId!, status: 'PUBLISHED' },
        orderBy: { version: 'desc' },
      })
      const rules = rule?.rules as { roster?: { playersOnPitch?: number } } | undefined
      if (rules?.roster?.playersOnPitch !== 8)
        throw rosterError(409, '本赛事须配置八人制首发人数，请联系赛事管理员')
      const snapshot = await tx.rosterSnapshot.findFirst({
        where: {
          id: input.rosterSnapshotId!,
          organizationId,
          tournamentId: input.tournamentId!,
          teamId,
          lockedAt: { not: null },
          teamRegistration: { status: 'APPROVED' },
        },
        include: { entries: { select: { playerProfileId: true } } },
      })
      if (!snapshot) throw rosterError(400, '请选择本场本队的锁定名单')
      const allowed = new Set(snapshot.entries.map((entry) => entry.playerProfileId))
      if (playerIds.some((id) => !allowed.has(id)))
        throw rosterError(400, '单场阵容球员必须全部来自绑定的锁定名单')
      if (confirming) {
        const current = await tx.rosterSnapshot.findFirst({
          where: {
            organizationId,
            tournamentId: input.tournamentId!,
            teamId,
            lockedAt: { not: null },
            teamRegistration: { status: 'APPROVED' },
          },
          orderBy: { snapshotVersion: 'desc' },
          select: { id: true },
        })
        if (current?.id !== snapshot.id)
          throw rosterError(409, '锁定名单已更新，请绑定最新名单并重新保存后确认首发')
      }
    } else if (playerIds.length) {
      const members = await tx.teamMembership.findMany({
        where: {
          organizationId,
          teamId,
          status: 'ACTIVE',
          playerProfileId: { in: playerIds },
          playerProfile: { organizationId },
        },
        select: { playerProfileId: true },
      })
      if (new Set(members.map((member) => member.playerProfileId)).size !== playerIds.length)
        throw rosterError(400, '战术只能安排本队现役且已关联档案的球员')
    }
  }

  async publish(
    authorization: string | undefined,
    teamId: string,
    planId: string,
    action: 'DEFAULT' | 'CONFIRM',
    input: LineupPlanCommandDto,
    key: string | undefined,
    requestId: string,
  ) {
    const actor = await this.auth.requireSession(authorization)
    if (!key || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
      throw rosterError(400, '请提供有效 Idempotency-Key')
    const route = `/captain/teams/${teamId}/lineup-plans/${planId}/${action === 'DEFAULT' ? 'default' : 'confirm'}`
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ organizationId: actor.organizationId, input }))
      .digest('hex')
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await this.access.authorize(tx, actor, '', teamId, false)
            await this.requireTeam(tx, actor.organizationId, teamId)
            await tx.$queryRaw`SELECT id FROM teams WHERE id = ${teamId}::uuid AND organization_id = ${actor.organizationId}::uuid FOR UPDATE`
            const previous = await tx.idempotencyRecord.findUnique({
              where: {
                userId_route_idempotencyKey: {
                  userId: actor.userId,
                  route,
                  idempotencyKey: key,
                },
              },
            })
            if (previous) {
              if (
                previous.organizationId !== actor.organizationId ||
                previous.requestHash !== requestHash ||
                previous.responseBody === null
              )
                throw rosterError(409, '同一幂等键不能用于不同的阵容操作')
              return previous.responseBody
            }
            const plan = await tx.teamLineupPlan.findFirst({
              where: { id: planId, organizationId: actor.organizationId, teamId },
            })
            if (!plan) throw rosterError(404, '战术计划不存在')
            if (plan.version !== input.expectedVersion)
              throw rosterError(409, '阵容已更新，请读取最新保存版本后再操作')
            if (action === 'DEFAULT' && (plan.kind !== 'TACTIC' || plan.tournamentId !== null))
              throw rosterError(400, '只有全队通用战术可以设为球队默认阵容')
            if (action === 'CONFIRM' && plan.kind !== 'MATCH_LINEUP')
              throw rosterError(400, '只有绑定比赛的阵容可以确认首发，球队默认阵容不能代替单场首发')
            const revision = await tx.teamLineupRevision.findUnique({
              where: { planId_version: { planId: plan.id, version: plan.version } },
            })
            if (!revision || revision.organizationId !== actor.organizationId)
              throw rosterError(409, '当前阵容缺少不可变保存版本，请重新保存')
            const saved = revision.payload as unknown as { lineup: SaveLineupPlanDto['payload'] }
            const command: SaveLineupPlanDto = {
              name: plan.name,
              kind: plan.kind,
              expectedVersion: plan.version,
              tournamentId: plan.tournamentId,
              matchId: plan.matchId,
              rosterSnapshotId: revision.rosterSnapshotId,
              payload: saved.lineup,
            }
            const playerIds = validateLineupPlan(command)
            if (
              action === 'DEFAULT' &&
              (command.payload.slots.some((slot) => !slot.playerId) ||
                command.payload.slots.filter((slot) => slot.label === 'GK').length !== 1)
            )
              throw rosterError(400, '默认阵容必须补齐8名球员，包含1名门将和7名场上球员')
            await this.validateContext(
              tx,
              actor.organizationId,
              teamId,
              command,
              playerIds,
              action === 'CONFIRM',
            )
            const replaced = await tx.teamLineupPlan.findMany({
              where: {
                organizationId: actor.organizationId,
                teamId,
                ...(action === 'DEFAULT'
                  ? { isDefault: true }
                  : {
                      matchId: plan.matchId,
                      confirmedVersion: { not: null },
                    }),
              },
              select: { id: true, confirmedVersion: true },
            })
            await tx.teamLineupPlan.updateMany({
              where: {
                id: { in: replaced.map((item) => item.id) },
                organizationId: actor.organizationId,
                teamId,
              },
              data:
                action === 'DEFAULT'
                  ? { isDefault: false }
                  : {
                      confirmedVersion: null,
                      confirmedAt: null,
                      confirmedByUserId: null,
                    },
            })
            const updated = await tx.teamLineupPlan.updateMany({
              where: {
                id: plan.id,
                organizationId: actor.organizationId,
                teamId,
                version: input.expectedVersion,
              },
              data:
                action === 'DEFAULT'
                  ? { isDefault: true }
                  : {
                      confirmedVersion: plan.version,
                      confirmedAt: new Date(),
                      confirmedByUserId: actor.userId,
                    },
            })
            if (updated.count !== 1) throw rosterError(409, '阵容已更新，请重新读取')
            const result = this.view(
              await tx.teamLineupPlan.findFirstOrThrow({
                where: { id: plan.id, organizationId: actor.organizationId, teamId },
                include: planInclude,
              }),
            )
            await tx.auditLog.create({
              data: {
                organizationId: actor.organizationId,
                actorType: 'USER',
                actorUserId: actor.userId,
                action: action === 'DEFAULT' ? 'TEAM_DEFAULT_LINEUP_SET' : 'MATCH_LINEUP_CONFIRMED',
                targetType: 'TeamLineupPlan',
                targetId: plan.id,
                beforeSummary: { replaced },
                afterSummary: {
                  version: plan.version,
                  matchId: plan.matchId,
                  confirmedVersion: result.confirmedVersion,
                },
                requestId,
                source: 'roster-workflow',
              },
            })
            await tx.idempotencyRecord.create({
              data: {
                organizationId: actor.organizationId,
                userId: actor.userId,
                route,
                idempotencyKey: key,
                requestHash,
                responseStatus: 200,
                responseBody: JSON.parse(JSON.stringify(result)),
                resourceType: 'TeamLineupPlan',
                resourceId: plan.id,
                expiresAt: new Date(Date.now() + 7 * 86400000),
              },
            })
            return result
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 15000,
          },
        )
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2034', 'P2002'].includes(error.code)
        ) {
          if (attempt < 2) continue
          throw rosterError(409, '阵容正在被更新，请用原操作请求重试')
        }
        throw error
      }
    }
    throw rosterError(409, '请用原操作请求重试')
  }

  private view(plan: {
    id: string
    teamId: string
    name: string
    kind: string
    tournamentId: string | null
    matchId: string | null
    rosterSnapshotId: string | null
    version: number
    isDefault: boolean
    confirmedVersion: number | null
    confirmedAt: Date | null
    confirmedByUserId: string | null
    payload: Prisma.JsonValue
    updatedAt: Date
    rosterSnapshot?: { entries: SnapshotPlayer[]; snapshotVersion: number } | null
  }) {
    return {
      id: plan.id,
      teamId: plan.teamId,
      name: plan.name,
      kind: plan.kind,
      tournamentId: plan.tournamentId,
      matchId: plan.matchId,
      rosterSnapshotId: plan.rosterSnapshotId,
      version: plan.version,
      isDefault: plan.isDefault,
      confirmedVersion: plan.confirmedVersion,
      confirmedAt: plan.confirmedAt?.toISOString() ?? null,
      confirmedByUserId: plan.confirmedByUserId,
      hasUnconfirmedChanges:
        plan.confirmedVersion !== null && plan.confirmedVersion !== plan.version,
      payload: plan.payload,
      updatedAt: plan.updatedAt.toISOString(),
      rosterSnapshotVersion: plan.rosterSnapshot?.snapshotVersion ?? null,
      snapshotPlayers:
        plan.rosterSnapshot?.entries.map((entry) => ({
          id: entry.playerProfileId,
          displayName: entry.displayName,
          shirtNumber: entry.shirtNumber,
          avatarUrl: entry.playerProfile.avatarUrl,
          position: entry.playerProfile.position,
        })) ?? [],
    }
  }
}
