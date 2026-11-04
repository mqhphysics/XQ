import { Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AuthService } from '../auth/auth.service'
import { PrismaService } from '../database/prisma.service'
import { centerError } from '../admin-center/admin-center.policy'
import { OFFICIAL_ROLES } from '../common/official-personnel'
import type { Prisma } from '../generated/prisma/client'
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
type Tx = Prisma.TransactionClient
@Injectable()
export class RefereeProfileService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async assignments(tx: Tx, organizationId: string) {
    const logs = await tx.auditLog.findMany({
      where: {
        organizationId,
        action: 'MATCH_OFFICIALS_RECORDED',
        targetType: 'Match',
        actorType: 'ADMIN',
        source: 'OFFICIAL_MATCH_DOCUMENT',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { targetId: true, afterSummary: true },
      take: 4000,
    })
    const seen = new Set<string>()
    return logs.flatMap((log) => {
      if (seen.has(log.targetId)) return []
      seen.add(log.targetId)
      const data = log.afterSummary
      if (!object(data) || data.matchId !== log.targetId || !Array.isArray(data.officials))
        return []
      return data.officials.flatMap((item: unknown) =>
        object(item) &&
        typeof item.studentRecordId === 'string' &&
        OFFICIAL_ROLES.includes(item.role as (typeof OFFICIAL_ROLES)[number])
          ? [{ matchId: log.targetId, studentId: item.studentRecordId, role: String(item.role) }]
          : [],
      )
    })
  }
  private async profile(tx: Tx, organizationId: string, userId: string) {
    const membership = await tx.organizationMembership.findFirst({
        where: { userId, organizationId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
        select: { user: { select: { id: true, studentRecordId: true } } },
      }),
      user = membership?.user
    if (!user) throw centerError(404, '人物资料不可用')
    const assignments = user.studentRecordId
      ? (await this.assignments(tx, organizationId)).filter(
          (item) => item.studentId === user.studentRecordId,
        )
      : []
    const matches = await tx.match.findMany({
      where: {
        organizationId,
        id: { in: assignments.map((item) => item.matchId) },
        status: 'FINISHED',
      },
      select: {
        id: true,
        tournamentId: true,
        scheduledStartAt: true,
        confirmedReportVersion: true,
        homeTeam: { select: { shortName: true, name: true } },
        awayTeam: { select: { shortName: true, name: true } },
      },
      orderBy: { scheduledStartAt: 'desc' },
    })
    const main = matches.filter((match) =>
      assignments.some((item) => item.matchId === match.id && item.role === 'REFEREE'),
    )
    const officialMain = main
      .filter((match) => (match.confirmedReportVersion || 0) > 0)
      .map((match) => match.id)
    const [yellowCards, redCards, description] = await Promise.all([
      tx.matchEvent.count({
        where: { organizationId, matchId: { in: officialMain }, type: 'YELLOW_CARD' },
      }),
      tx.matchEvent.count({
        where: { organizationId, matchId: { in: officialMain }, type: 'RED_CARD' },
      }),
      tx.auditLog.findFirst({
        where: {
          organizationId,
          action: 'REFEREE_PROFILE_UPDATED',
          targetType: 'User',
          targetId: user.id,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { afterSummary: true },
      }),
    ])
    const bio =
      object(description?.afterSummary) && typeof description.afterSummary.bio === 'string'
        ? description.afterSummary.bio
        : ''
    return {
      isReferee: matches.length > 0,
      totalMatches: matches.length,
      refereeMatches: main.length,
      assistantMatches: matches.filter((match) =>
        assignments.some((item) => item.matchId === match.id && item.role.startsWith('ASSISTANT_')),
      ).length,
      fourthOfficialMatches: matches.filter((match) =>
        assignments.some((item) => item.matchId === match.id && item.role === 'FOURTH_OFFICIAL'),
      ).length,
      yellowCards,
      redCards,
      bio,
      matches: matches.map((match) => ({
        matchId: match.id,
        tournamentId: match.tournamentId,
        label: `${match.homeTeam?.shortName || match.homeTeam?.name || '主队'} vs ${match.awayTeam?.shortName || match.awayTeam?.name || '客队'}`,
        scheduledStartAt: match.scheduledStartAt?.toISOString() || null,
        roles: [
          ...new Set(
            assignments.filter((item) => item.matchId === match.id).map((item) => item.role),
          ),
        ],
      })),
    }
  }
  async read(organizationId: string, userId: string) {
    return this.db.$transaction((tx) => this.profile(tx, organizationId, userId))
  }
  async save(auth: string | undefined, bio: string, requestId: string) {
    const actor = await this.auth.requireSession(auth)
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM app_users WHERE id=${actor.userId}::uuid FOR UPDATE`
      const old = await this.profile(tx, actor.organizationId, actor.userId)
      if (!old.isReferee) throw centerError(403, '实际执裁过比赛后才可编辑裁判介绍')
      if (old.bio !== bio.trim())
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorType: 'USER',
            actorUserId: actor.userId,
            action: 'REFEREE_PROFILE_UPDATED',
            targetType: 'User',
            targetId: actor.userId,
            source: 'SELF_PROFILE',
            requestId: requestId || randomUUID(),
            beforeSummary: { bio: old.bio },
            afterSummary: { bio: bio.trim() },
          },
        })
      return { ...old, bio: bio.trim() }
    })
  }
  async people(organizationId: string, matchId: string) {
    const exists = await this.db.match.findFirst({
      where: { id: matchId, organizationId, status: { not: 'DRAFT' } },
      select: { id: true },
    })
    if (!exists) throw centerError(404, '比赛不存在')
    const rows = (await this.assignments(this.db, organizationId)).filter(
      (item) => item.matchId === matchId,
    )
    const students = await this.db.studentRecord.findMany({
      where: { organizationId, status: 'ACTIVE', id: { in: rows.map((item) => item.studentId) } },
      select: {
        id: true,
        realName: true,
        user: { select: { id: true, status: true } },
        player: { select: { id: true } },
      },
    })
    return {
      items: rows.flatMap((row) => {
        const student = students.find((item) => item.id === row.studentId)
        return student
          ? [
              {
                role: row.role,
                displayName: student.realName,
                userId: student.user?.status === 'ACTIVE' ? student.user.id : null,
                playerId: student.player?.id || null,
              },
            ]
          : []
      }),
    }
  }
}
