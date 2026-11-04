import { Inject, Injectable } from '@nestjs/common'
import { CampusCommandService } from './campus-command.service'
import { centerError } from '../admin-center/admin-center.policy'
import { withSeasonTeamProfile } from '../common/season-team-profile'
import type { CampusSeasonTeamDto } from './campus.dto'

@Injectable()
export class TeamSeasonService {
  constructor(@Inject(CampusCommandService) readonly command: CampusCommandService) {}
  list(auth: string | undefined, tournamentId: string) {
    return this.command.read(auth, true, async (tx, actor) => {
      if (!tournamentId) return { tournament: null, items: [] }
      const tournament = await tx.tournament.findFirst({
        where: { id: tournamentId, organizationId: actor.organizationId },
        include: { season: true, competitionDefinition: true },
      })
      if (!tournament) throw centerError(404, '赛事不属于当前组织')
      const rows = await tx.teamRegistration.findMany({
        where: { organizationId: actor.organizationId, tournamentId },
        include: {
          team: {
            include: {
              memberships: {
                where: { status: 'ACTIVE', playerProfileId: { not: null } },
                include: {
                  playerProfile: {
                    include: {
                      studentRecord: { select: { id: true } },
                      linkedUser: { select: { id: true, displayName: true } },
                    },
                  },
                },
                orderBy: { joinedAt: 'asc' },
              },
            },
          },
          group: true,
          rosterSnapshots: {
            where: { lockedAt: { not: null } },
            orderBy: { snapshotVersion: 'desc' },
            take: 1,
            include: {
              entries: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  playerProfile: {
                    select: {
                      id: true,
                      avatarUrl: true,
                      studentRecord: { select: { id: true, realName: true, studentNumber: true } },
                      linkedUser: { select: { id: true, displayName: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { team: { name: 'asc' } },
      })
      return {
        tournament,
        items: rows.map((row) => ({
          ...row,
          seasonTeam: withSeasonTeamProfile(row.team, row.teamProfileSnapshot),
        })),
      }
    })
  }
  save(
    auth: string | undefined,
    id: string,
    body: CampusSeasonTeamDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(
      auth,
      `campus:team-season:${id}`,
      body,
      key,
      true,
      async (tx, actor) => {
        const row = await tx.teamRegistration.findFirst({
          where: { id, organizationId: actor.organizationId },
          include: { team: true },
        })
        if (!row) throw centerError(404, '本赛季球队报名不存在')
        if (row.updatedAt.toISOString() !== new Date(body.expectedUpdatedAt).toISOString())
          throw centerError(409, '球队本赛季资料已更新，请刷新')
        const { reason, expectedUpdatedAt, ...profile } = body
        const before = withSeasonTeamProfile(row.team, row.teamProfileSnapshot)
        const saved = await tx.teamRegistration.update({
          where: { id, updatedAt: row.updatedAt },
          data: {
            teamProfileSnapshot: {
              ...(row.teamProfileSnapshot && typeof row.teamProfileSnapshot === 'object' && !Array.isArray(row.teamProfileSnapshot)
                ? row.teamProfileSnapshot : {}),
              ...profile,
            },
          },
        })
        // Display identity belongs to the team; update it as well as this season's overrides.
        await tx.team.update({ where: { id: row.teamId }, data: {
          ...(profile.name !== undefined ? { name: profile.name } : {}),
          ...(profile.shortName !== undefined ? { shortName: profile.shortName } : {}),
        } })
        await this.command.audit(
          tx,
          actor,
          'TEAM_SEASON_PROFILE_UPDATED',
          'TeamRegistration',
          id,
          reason,
          requestId,
          row.teamProfileSnapshot,
          saved.teamProfileSnapshot,
        )
        return saved
      },
    )
  }
}
