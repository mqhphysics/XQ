import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { AuthService } from '../auth/auth.service'
import { PrismaService } from '../database/prisma.service'
import { ExperienceService } from '../experience/experience.service'
import { selectPublicTournament } from '../common/public-tournament'
import { ApiHttpException } from '../common/api-http.exception'
import { emptyFocusPreferences, rankFocusMatches } from './focus-matches.logic'

@Injectable()
export class FocusMatchesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ExperienceService) private readonly experience: ExperienceService,
  ) {}

  async list(organizationId: string, tournamentId: string, authorization?: string) {
    const session = await this.auth.getSession(authorization)
    if (session && session.organizationId !== organizationId)
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '组织与当前账号不一致',
      })
    const selected = await selectPublicTournament(this.prisma, organizationId, tournamentId)
    const competition = selected.competitionDefinitionId
      ? await this.prisma.competitionDefinition.findFirst({
          where: { id: selected.competitionDefinitionId, organizationId },
        })
      : null
    const related = await this.prisma.tournament.findMany({
      where: {
        organizationId,
        seasonId: selected.seasonId,
        status: 'PUBLISHED',
        ...(competition
          ? { competitionDefinition: { organizationId, cupName: competition.cupName } }
          : { id: selected.id }),
      },
      include: { competitionDefinition: true },
      orderBy: { id: 'asc' },
    })
    const preferences = emptyFocusPreferences()
    if (session) {
      const [user, teams, history] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: session.userId },
          select: { studentVerifiedAt: true, studentRecord: true },
        }),
        this.prisma.userTeamPreference.findMany({
          where: { organizationId, userId: session.userId },
        }),
        this.prisma.userMatchInterest.findMany({
          where: {
            organizationId,
            userId: session.userId,
            lastViewedAt: { gte: new Date(Date.now() - 30 * 86400000) },
            match: { status: { not: 'DRAFT' }, tournament: { status: 'PUBLISHED' } },
          },
          include: {
            match: {
              select: {
                homeTeamId: true,
                awayTeamId: true,
                tournament: { select: { competitionDefinition: { select: { gender: true } } } },
              },
            },
          },
          orderBy: { lastViewedAt: 'desc' },
          take: 200,
        }),
      ])
      preferences.primaryTeams = teams.filter((t) => t.isPrimary).map((t) => t.teamId)
      preferences.followedTeams = teams.filter((t) => !t.isPrimary).map((t) => t.teamId)
      const student = user?.studentRecord
      if (
        user?.studentVerifiedAt &&
        student?.organizationId === organizationId &&
        student.status === 'ACTIVE'
      ) {
        preferences.college = student.collegeName.trim()
        preferences.gender = student.gender
      }
      preferences.history = history.map((item) => ({
        teamIds: [item.match.homeTeamId, item.match.awayTeamId].filter((id): id is string => !!id),
        gender: item.match.tournament.competitionDefinition?.gender || '',
        count: item.viewCount,
        viewedAt: item.lastViewedAt,
      }))
    }
    const candidates = (
      await Promise.all(
        related.map(async (tournament) =>
          (await this.experience.getFocusCandidates(organizationId, tournament.id)).map(
            (match) => ({
              ...match,
              focusGender: tournament.competitionDefinition?.gender || '',
              focusCupName: tournament.competitionDefinition?.cupName || '',
            }),
          ),
        ),
      )
    ).flat()
    return { items: rankFocusMatches(candidates, preferences).slice(0, 3) }
  }

  async record(authorization: string | undefined, matchId: string) {
    const session = await this.auth.requireSession(authorization)
    const { organizationId, userId } = session
    return this.prisma.$transaction(async (tx) => {
      const match = await tx.match.findFirst({
        where: { id: matchId, organizationId, status: { not: 'DRAFT' } },
        select: { tournamentId: true },
      })
      if (!match)
        throw new ApiHttpException(HttpStatus.NOT_FOUND, {
          code: ERROR_CODES.NOT_FOUND,
          message: '比赛不存在或尚未公开',
        })
      await selectPublicTournament(tx, organizationId, match.tournamentId)
      // Atomic cooldown: retries and simultaneous reads cannot inflate an interest.
      const changed = await tx.$executeRaw`
        INSERT INTO user_match_interests (organization_id, user_id, match_id)
        VALUES (${organizationId}::uuid, ${userId}::uuid, ${matchId}::uuid)
        ON CONFLICT (user_id, match_id) DO UPDATE SET
          view_count = CASE WHEN user_match_interests.last_viewed_at < now() - interval '30 days' THEN 1
            ELSE LEAST(20, user_match_interests.view_count + 1) END,
          last_viewed_at = now()
        WHERE user_match_interests.last_viewed_at <= now() - interval '15 minutes'
      `
      await tx.userMatchInterest.deleteMany({
        where: {
          organizationId,
          userId,
          lastViewedAt: { lt: new Date(Date.now() - 30 * 86400000) },
        },
      })
      return { accepted: changed > 0 }
    })
  }
}
