import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { fixtureId } from '../database/demo-fixture'
import { centerError } from '../admin-center/admin-center.policy'
import { randomUUID } from 'node:crypto'

/** Explicit local maintenance for the user-authorized shared trial organization. */
@Injectable()
export class SharedEventsSetupService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async configure(organizationId: string, ownerUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const actor = await tx.user.findFirst({
        where: {
          id: ownerUserId,
          status: 'ACTIVE',
          memberships: { some: { organizationId, status: 'ACTIVE' } },
          roleAssignments: {
            some: {
              organizationId,
              role: 'ORGANIZATION_ADMIN',
              scopeType: 'ORGANIZATION',
              scopeId: organizationId,
              revokedAt: null,
              grantedAt: { lte: new Date() },
            },
          },
        },
        select: { id: true },
      })
      if (!actor) throw centerError(403, '需要当前组织的有效管理账号执行初始化')
      const simulation = await tx.tournament.findFirst({
        where: { organizationId, tournamentCode: 'DEMO-GREEN-CUP-2026' },
        include: { season: true },
      })
      if (!simulation) throw centerError(409, '找不到应保留的模拟赛事，未修改资料')
      const [teams, groups] = await Promise.all([
        tx.teamRegistration.count({
          where: { organizationId, tournamentId: simulation.id, status: 'APPROVED' },
        }),
        tx.tournamentGroup.count({
          where: { organizationId, stage: { tournamentId: simulation.id } },
        }),
      ])
      if (teams !== 16 || groups !== 4)
        throw centerError(409, '模拟赛事必须是16队、4组；请先核对现有数据')
      await tx.tournament.update({
        where: { id: simulation.id },
        data: { name: '模拟赛事', status: 'PUBLISHED' },
      })
      await tx.season.update({
        where: { id: simulation.seasonId },
        data: { name: '2026', startsOn: new Date('2026-01-01'), endsOn: new Date('2026-12-31') },
      })
      const code = 'JIKE-CUP-2026'
      const existing = await tx.tournament.findUnique({
        where: { organizationId_tournamentCode: { organizationId, tournamentCode: code } },
      })
      const real =
        existing ??
        (await tx.tournament.create({
          data: {
            id: fixtureId(`shared-tournament:${organizationId}:${code}`),
            organizationId,
            seasonId: simulation.seasonId,
            tournamentCode: code,
            name: '2026计科杯',
            status: 'PUBLISHED',
          },
        }))
      const other = await tx.tournament.findMany({
        where: { organizationId, status: 'PUBLISHED', id: { notIn: [simulation.id, real.id] } },
        select: { id: true, name: true },
      })
      if (other.length)
        await tx.tournament.updateMany({
          where: { id: { in: other.map((item) => item.id) }, organizationId },
          data: { status: 'ARCHIVED' },
        })
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: 'ADMIN',
          actorUserId: ownerUserId,
          actorRoleSnapshot: [
            { role: 'ORGANIZATION_ADMIN', scopeType: 'ORGANIZATION', scopeId: organizationId },
          ],
          action: 'SHARED_EVENTS_CONFIGURED',
          targetType: 'Tournament',
          targetId: simulation.id,
          beforeSummary: {
            simulationName: simulation.name,
            archived: other.map((item) => item.id),
          },
          afterSummary: {
            simulationName: '模拟赛事',
            realTournamentId: real.id,
            realCreated: !existing,
          },
          source: 'LOCAL_MAINTENANCE',
          reason: '用户要求统一数据并仅保留模拟赛事及2026计科杯；历史赛事保留',
          requestId: randomUUID(),
        },
      })
      return {
        simulationId: simulation.id,
        realTournamentId: real.id,
        realCreated: !existing,
        archivedCount: other.length,
        teams,
        groups,
      }
    })
  }
}
