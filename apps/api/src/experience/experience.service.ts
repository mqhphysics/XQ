import { publicSearchPlan, rankPublicSearch } from './search-relevance'
import { playerAvatar } from '../media/player-avatar'
import {
  clockAdministrator,
  clockStartPermission,
  matchClockView,
} from '../schedule/match-clock.logic'
import { createHash } from 'node:crypto'
import { defaultAvatar, defaultCover } from '../media/default-media'
import { matchReportTagKey } from './match-report-tag'
import { documentMatchLineup } from './document-match-lineup'
import { playerSchedule } from './player-schedule'
import {
  competitionAnnouncementKey,
  featuredHomeMatches,
  homeContent,
  periodMinutes,
} from './home-content'
import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { AuthService } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { selectPublicTournament } from '../common/public-tournament'
import { withSeasonTeamProfile } from '../common/season-team-profile'
import { fixedCaptainFacts, matchOfficials } from '../common/official-personnel'
import { isDemoFixtureOrganization } from '../common/demo-fixture-organization'
import { PrismaService } from '../database/prisma.service'
import { MediaService, postImageUrls, commentImageUrls } from '../media/media.service'
import { ImageTransferService } from '../media-transfer/image-transfer.service'
import {
  AuditActorType,
  MatchEventType,
  MatchStatus,
  NotificationType,
  PostStatus,
  PostType,
  type Prisma,
} from '../generated/prisma/client'
import { ResultsService } from '../results/results.service'
import {
  mapPostTags,
  normalizePostTags,
  postTagFingerprint,
  resolvePostTags,
  type ResolvedPostTag,
} from './post-tags'
import { parseResultsRules } from '../results/parse-rules'
import { SocialService } from '../social/social.service'
import {
  assertInteractionAllowed,
  blockedUserIds,
  visiblePostWhere,
} from '../social/interaction-policy'
import { decodeFavoriteCursor, encodeFavoriteCursor } from './favorite-pagination'
import { calculateOfficialTeamRecord } from './official-team-record'
import { confirmedMatchLineup } from './confirmed-match-lineup'
import { defaultMatchLineup } from './default-match-lineup'
import { identityPostWhere } from './identity-posts'
import { saveMatchReview, summarizeMatchRatings } from './match-reviews'
import type {
  CreateCommentDto,
  CreateMatchReviewDto,
  CreatePostDto,
  SearchQueryDto,
  UpdateTeamPreferencesDto,
  ContentVersionDto,
  UpdateCommentDto,
  UpdatePostDto,
} from './experience.dto'
import { calculateStandings } from './ranking'
import { AiModerationService } from '../ai-moderation/ai-moderation.service'
import {
  officialIdentity,
  publicIdentity,
  publicIdentitySelect,
  type PublicIdentitySource,
} from './public-identity'

@Injectable()
export class ExperienceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(SocialService) private readonly socialService: SocialService,
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Optional() @Inject(ResultsService) private readonly resultsService?: ResultsService,
    @Optional() @Inject(AiModerationService) private readonly aiModeration?: AiModerationService,
    @Optional()
    @Inject(ImageTransferService)
    private readonly imageTransfers?: ImageTransferService,
  ) {}

  async getHome(
    organizationId: string,
    authorization?: string,
    tournamentId?: string,
    selection?: { competitionDefinitionId?: string | undefined; seasonId?: string | undefined },
  ) {
    const session = await this.authService.getSession(authorization)
    const blocked = await blockedUserIds(
      this.prisma,
      organizationId,
      session?.organizationId === organizationId ? session.userId : undefined,
    )
    const tournament = await this.getFeaturedTournament(
      organizationId,
      tournamentId,
      undefined,
      selection,
    )
    const [matches, registrations, posts, directoryTeams, platformPosts, announcements] =
      await Promise.all([
        this.prisma.match.findMany({
          where: { organizationId, tournamentId: tournament.id, status: { not: 'DRAFT' } },
          include: matchSummaryInclude,
          orderBy: [{ scheduledStartAt: 'asc' }, { sortOrder: 'asc' }],
        }),
        this.prisma.teamRegistration.findMany({
          where: { organizationId, tournamentId: tournament.id, status: 'APPROVED' },
          include: { team: true, group: true },
          orderBy: [{ group: { sortOrder: 'asc' } }, { team: { name: 'asc' } }],
        }),
        this.prisma.post.findMany({
          where: {
            ...visiblePostWhere(blocked),
            organizationId,
            status: PostStatus.PUBLISHED,
            OR: [
              { tournamentId: tournament.id },
              { tournamentId: null, type: PostType.COMMUNITY },
              {
                tournamentId: null,
                type: PostType.OFFICIAL,
                tags: {
                  some: {
                    key: competitionAnnouncementKey(
                      tournament.tournamentCode,
                      tournament.season.seasonCode,
                    ),
                  },
                },
              },
              {
                type: PostType.OFFICIAL,
                tournament: {
                  seasonId: tournament.seasonId,
                  tournamentCode: {
                    startsWith:
                      tournament.tournamentCode.split('-')[0]!.replace(/_(?:MEN|WOMEN)$/, '') + '_',
                  },
                },
                tags: { some: { key: { startsWith: 'match-report:' } } },
              },
            ],
          },
          include: postSummaryInclude(session?.userId, blocked),
          orderBy: { publishedAt: 'desc' },
          take: 20,
        }),
        this.prisma.team.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
        this.prisma.post.findMany({
          where: {
            ...visiblePostWhere(blocked),
            organizationId,
            tournamentId: null,
            type: PostType.OFFICIAL,
            status: PostStatus.PUBLISHED,
            tags: { none: { key: { startsWith: 'competition-announcement:' } } },
          },
          include: postSummaryInclude(session?.userId, blocked),
          orderBy: { publishedAt: 'desc' },
          take: 4,
        }),
        this.prisma.post.findMany({
          where: {
            ...visiblePostWhere(blocked),
            organizationId,
            status: PostStatus.PUBLISHED,
            type: PostType.OFFICIAL,
            tags: { none: { key: { startsWith: 'match-report:' } } },
            OR: [
              { tournamentId: tournament.id },
              {
                tournamentId: null,
                tags: {
                  some: {
                    key: competitionAnnouncementKey(
                      tournament.tournamentCode,
                      tournament.season.seasonCode,
                    ),
                  },
                },
              },
            ],
          },
          include: postSummaryInclude(session?.userId, blocked),
          orderBy: { publishedAt: 'desc' },
          take: 3,
        }),
      ])
    const registrationByTeam = new Map(
      registrations.map((registration) => [registration.teamId, registration]),
    )

    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        seasonName: tournament.season.name,
        status: tournament.status,
        teamCount: registrations.length,
        matchCount: matches.length,
      },
      announcements: homeContent(announcements).announcements.map((post) =>
        mapPost(post, session?.userId),
      ),
      platformAnnouncements: platformPosts.map((post) => mapPost(post, session?.userId)),
      focusMatches: featuredHomeMatches(matches).map(mapMatch),
      teams: directoryTeams.map((team) => ({
        ...mapTeam(
          withSeasonTeamProfile(team, registrationByTeam.get(team.id)?.teamProfileSnapshot),
        ),
        groupName: registrationByTeam.get(team.id)?.group?.name ?? null,
        registeredInTournament: registrationByTeam.has(team.id),
      })),
      posts: homeContent(posts).feed.map((post) => mapPost(post, session?.userId)),
      viewer: session?.user ?? null,
    }
  }

  async recommendationPool(
    organizationId: string,
    userId: string | undefined,
    tournamentId?: string,
    selection?: { competitionDefinitionId?: string | undefined; seasonId?: string | undefined },
    batchPostIds?: string[],
  ) {
    const blocked = await blockedUserIds(this.prisma, organizationId, userId)
    const tournament = await this.getFeaturedTournament(
      organizationId,
      tournamentId,
      undefined,
      selection,
    )
    const rows = await this.prisma.post.findMany({
      where: {
        ...visiblePostWhere(blocked),
        organizationId,
        status: PostStatus.PUBLISHED,
        ...(batchPostIds ? { id: { in: batchPostIds } } : {}),
        OR: [
          { tournamentId: tournament.id },
          { tournamentId: null },
          {
            type: PostType.OFFICIAL,
            tournament: {
              seasonId: tournament.seasonId,
              tournamentCode: {
                startsWith:
                  tournament.tournamentCode.split('-')[0]!.replace(/_(?:MEN|WOMEN)$/, '') + '_',
              },
            },
            tags: { some: { key: { startsWith: 'match-report:' } } },
          },
        ],
      },
      include: postSummaryInclude(userId, blocked),
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      take: 400,
    })
    return {
      tournamentId: tournament.id,
      posts: rows.map((row) => mapPost(row, userId)),
      authors: Object.fromEntries(rows.map((row) => [row.id, row.authorUserId])),
      sources: Object.fromEntries(rows.map((row) => [row.id, row.publicationSource])),
    }
  }

  async search(
    organizationId: string,
    input: SearchQueryDto,
    tournamentId?: string,
    selection?: { competitionDefinitionId?: string | undefined; seasonId?: string | undefined },
    authorization?: string,
  ) {
    const session = await this.authService.getSession(authorization)
    const blocked = await blockedUserIds(
      this.prisma,
      organizationId,
      session?.organizationId === organizationId ? session.userId : undefined,
    )
    const tournament = await this.getFeaturedTournament(
      organizationId,
      tournamentId,
      undefined,
      selection,
    )
    const snapshotScope = {
      organizationId,
      tournamentId: tournament.id,
      lockedAt: { not: null },
      teamRegistration: {
        organizationId,
        tournamentId: tournament.id,
        status: 'APPROVED' as const,
      },
    }
    const query = input.query
    const plan = publicSearchPlan(query)
    if (!plan.recall.length) return { query, players: [], teams: [], matches: [], posts: [] }
    const like = (term: string) => ({ contains: term, mode: 'insensitive' as const })
    const teamRecall = plan.recall.flatMap((term) => [
      { name: like(term) },
      { shortName: like(term) },
      { collegeName: like(term) },
    ])
    const wants = (category: SearchQueryDto['category']) =>
      input.category === 'ALL' || input.category === category

    const [players, teams, matches, posts] = await Promise.all([
      wants('PLAYER')
        ? this.prisma.playerProfile.findMany({
            where: {
              organizationId,
              AND: [
                {
                  OR: [
                    {
                      snapshotEntries: { some: { organizationId, rosterSnapshot: snapshotScope } },
                    },
                    {
                      teamMemberships: {
                        some: { organizationId, status: 'ACTIVE', team: { organizationId } },
                      },
                    },
                  ],
                },
              ],
              OR: [
                ...plan.recall.flatMap((term) => [
                  { displayName: like(term) },
                  { jerseyName: like(term) },
                ]),
                {
                  teamMemberships: {
                    some: {
                      organizationId,
                      status: 'ACTIVE',
                      team: { organizationId, OR: teamRecall },
                    },
                  },
                },
                {
                  snapshotEntries: {
                    some: {
                      organizationId,
                      rosterSnapshot: {
                        ...snapshotScope,
                        team: { organizationId, OR: teamRecall },
                      },
                    },
                  },
                },
              ],
            },
            include: {
              teamMemberships: {
                where: { organizationId, status: 'ACTIVE', team: { organizationId } },
                include: { team: true },
                orderBy: { joinedAt: 'desc' },
                take: 1,
              },
              snapshotEntries: {
                where: { organizationId, rosterSnapshot: snapshotScope },
                include: { rosterSnapshot: { include: { team: true } } },
                orderBy: { rosterSnapshot: { snapshotVersion: 'desc' } },
                take: 1,
              },
            },
            orderBy: { displayName: 'asc' },
            take: 500,
          })
        : [],
      wants('TEAM')
        ? this.prisma.team.findMany({
            where: {
              organizationId,
              OR: teamRecall,
            },
            orderBy: { name: 'asc' },
            take: 200,
          })
        : [],
      wants('MATCH')
        ? this.prisma.match.findMany({
            where: {
              organizationId,
              tournamentId: tournament.id,
              status: { not: 'DRAFT' },
              OR: plan.recall.flatMap((term) => [
                { title: like(term) },
                { homeTeam: { name: like(term) } },
                { homeTeam: { shortName: like(term) } },
                { awayTeam: { name: like(term) } },
                { awayTeam: { shortName: like(term) } },
                { venue: { name: like(term) } },
              ]),
            },
            include: matchSummaryInclude,
            orderBy: { scheduledStartAt: 'desc' },
            take: 250,
          })
        : [],
      wants('POST')
        ? this.prisma.post.findMany({
            where: {
              ...visiblePostWhere(blocked),
              organizationId,
              tournamentId: tournament.id,
              status: PostStatus.PUBLISHED,
              OR: plan.recall.flatMap((term) => [
                { title: like(term) },
                { body: like(term) },
                { tags: { some: { organizationId, label: like(term) } } },
              ]),
            },
            include: postSummaryInclude(session?.userId, blocked),
            orderBy: { publishedAt: 'desc' },
            take: 250,
          })
        : [],
    ])

    return {
      query,
      players: rankPublicSearch(
        players,
        query,
        (player) => {
          const team =
            player.snapshotEntries[0]?.rosterSnapshot.team || player.teamMemberships[0]?.team
          return [
            { text: player.displayName, weight: 5 },
            { text: player.jerseyName, weight: 3 },
            { text: team?.name, weight: 1 },
            { text: team?.shortName, weight: 1.5 },
            { text: team?.collegeName, weight: 0.6 },
          ]
        },
        40,
      ).map((player) => ({
        id: player.id,
        displayName: player.displayName,
        position: player.position,
        academicYear: player.academicYear,
        profileColor: player.profileColor,
        avatarUrl: playerAvatar(player),
        team: player.snapshotEntries[0]?.rosterSnapshot.team
          ? mapTeam(player.snapshotEntries[0].rosterSnapshot.team)
          : player.teamMemberships[0]
            ? mapTeam(player.teamMemberships[0].team)
            : null,
      })),
      teams: rankPublicSearch(
        teams,
        query,
        (team) => [
          { text: team.name, weight: 3 },
          { text: team.shortName, weight: 4 },
          { text: team.collegeName, weight: 1 },
        ],
        8,
      ).map(mapTeam),
      matches: rankPublicSearch(
        matches,
        query,
        (match) => [
          { text: match.title, weight: 3 },
          { text: match.homeTeam?.name, weight: 2 },
          { text: match.homeTeam?.shortName, weight: 2 },
          { text: match.awayTeam?.name, weight: 2 },
          { text: match.awayTeam?.shortName, weight: 2 },
          { text: match.venue?.name, weight: 1 },
        ],
        8,
      ).map(mapMatch),
      posts: rankPublicSearch(
        posts,
        query,
        (post) => [
          { text: post.title, weight: 3 },
          { text: post.body, weight: 1 },
          ...post.tags.map((tag) => ({ text: tag.label, weight: 2 })),
        ],
        8,
      ).map((post) => mapPost(post)),
    }
  }

  async listSeasons(
    organizationId: string,
    prisma: Pick<PrismaService, 'tournament'> = this.prisma,
  ) {
    const tournaments = await prisma.tournament.findMany({
      where: {
        organizationId,
        status: 'PUBLISHED',
        organization: { status: 'ACTIVE' },
        season: { organizationId },
      },
      include: { season: true },
      orderBy: { season: { startsOn: 'desc' } },
    })

    return tournaments.map((tournament) => ({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      seasonId: tournament.season.id,
      seasonName: tournament.season.name,
      year: tournament.season.seasonCode.slice(0, 4),
      status: tournament.status,
    }))
  }

  async getCompetitionData(organizationId: string, tournamentId?: string) {
    return this.prisma.$transaction(
      (prisma) => this.getCompetitionDataSnapshot(organizationId, tournamentId, prisma),
      { isolationLevel: 'RepeatableRead' },
    )
  }

  async getFocusCandidates(organizationId: string, tournamentId: string) {
    return this.prisma.$transaction(
      async (prisma) => {
        const tournament = await this.getFeaturedTournament(organizationId, tournamentId, prisma)
        const context = await this.resultContext(organizationId, tournament, prisma)
        const matches = await prisma.match.findMany({
          where: {
            organizationId,
            tournamentId,
            status: { in: ['SCHEDULED', 'LIVE', 'FINISHED'] },
          },
          include: { ...matchSummaryInclude, stage: true, group: true, round: true },
        })
        return matches.map((match) => mapResultMatch(match, context.official))
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }

  private async getCompetitionDataSnapshot(
    organizationId: string,
    tournamentId: string | undefined,
    prisma: Prisma.TransactionClient,
  ) {
    const tournament = await this.getFeaturedTournament(organizationId, tournamentId, prisma)
    if (!tournament) throw notFound('赛事不存在')
    const resultContext = await this.resultContext(organizationId, tournament, prisma)

    const [registrations, matches, events, appearances, seasons] = await Promise.all([
      prisma.teamRegistration.findMany({
        where: { organizationId, tournamentId: tournament.id, status: 'APPROVED' },
        include: { team: true, group: true },
        orderBy: [{ group: { sortOrder: 'asc' } }, { team: { name: 'asc' } }],
      }),
      prisma.match.findMany({
        where: { organizationId, tournamentId: tournament.id, status: { not: 'DRAFT' } },
        include: { ...matchSummaryInclude, stage: true, group: true, round: true },
        orderBy: [{ scheduledStartAt: 'asc' }, { sortOrder: 'asc' }],
      }),
      prisma.matchEvent.findMany({
        where: {
          organizationId,
          match: resultContext.matchWhere,
        },
        include: { player: true, relatedPlayer: true, team: true },
      }),
      prisma.matchAppearance.findMany({
        where: {
          organizationId,
          match: resultContext.matchWhere,
        },
        include: { player: true, team: true },
      }),
      this.listSeasons(organizationId, prisma),
    ])

    const groupMap = new Map<
      string,
      { id: string; name: string; teams: typeof registrations; matches: typeof matches }
    >()
    for (const registration of registrations) {
      if (!registration.group) continue
      const group = groupMap.get(registration.group.id) ?? {
        id: registration.group.id,
        name: registration.group.name,
        teams: [],
        matches: [],
      }
      group.teams.push(registration)
      groupMap.set(registration.group.id, group)
    }
    for (const match of matches) {
      if (match.groupId && groupMap.has(match.groupId)) {
        groupMap.get(match.groupId)!.matches.push(match)
      }
    }

    const groups = [...groupMap.values()].map((group) => ({
      id: group.id,
      name: group.name,
      unresolvedTies:
        resultContext.official?.groups.find((item) => item.id === group.id)?.standings
          .unresolvedTies ?? [],
      standings: resultContext.official
        ? (
            resultContext.official.groups.find((item) => item.id === group.id)?.standings.rows ?? []
          ).map((row) => {
            const team = group.teams.find((item) => item.team.id === row.teamId)?.team
            return {
              ...row,
              teamName: team?.name ?? '',
              shortName: team?.shortName ?? team?.name ?? '',
              primaryColor: team?.primaryColor ?? null,
              isLive: false,
            }
          })
        : calculateStandings(
            group.teams.map(({ team }) => ({
              id: team.id,
              name: team.name,
              shortName: team.shortName ?? team.name,
              primaryColor: team.primaryColor,
            })),
            group.matches
              .filter(
                (match) =>
                  (match.status === MatchStatus.FINISHED || match.status === MatchStatus.LIVE) &&
                  match.homeTeamId &&
                  match.awayTeamId &&
                  match.homeScore !== null &&
                  match.awayScore !== null,
              )
              .map((match) => ({
                homeTeamId: match.homeTeamId!,
                awayTeamId: match.awayTeamId!,
                homeScore: match.homeScore!,
                awayScore: match.awayScore!,
                isLive: match.status === MatchStatus.LIVE,
                startedAt: match.scheduledStartAt ?? new Date(0),
              })),
          ).map(({ id, name, provisional, ...row }) => ({
            ...row,
            teamId: id,
            teamName: name,
            isLive: provisional,
          })),
    }))

    const bracketRounds = new Map<
      string,
      { id: string; name: string; number: number; matches: unknown[] }
    >()
    for (const match of matches.filter((item) => item.stage?.type === 'KNOCKOUT')) {
      const roundKey = match.round?.id ?? `round-${match.title}`
      const round = bracketRounds.get(roundKey) ?? {
        id: roundKey,
        name: match.round?.name ?? '淘汰赛',
        number: match.round?.roundNumber ?? 99,
        matches: [],
      }
      round.matches.push({
        ...mapResultMatch(match, resultContext.official),
        homePlaceholder: match.homeTeam ? null : knockoutPlaceholder(match.matchCode, 'home'),
        awayPlaceholder: match.awayTeam ? null : knockoutPlaceholder(match.matchCode, 'away'),
      })
      bracketRounds.set(roundKey, round)
    }

    const playerStats = buildPlayerStats(events, appearances)

    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        seasonName: tournament.season.name,
        status: tournament.status,
      },
      seasons,
      schedule: matches.map((match) => mapResultMatch(match, resultContext.official)),
      groups,
      resultsMode: resultContext.mode,
      ruleVersionId: resultContext.official?.ruleVersionId ?? null,
      bracket: [...bracketRounds.values()].sort((a, b) => a.number - b.number),
      leaders: {
        scorers: playerStats
          .filter((player) => player.goals > 0)
          .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
          .slice(0, 10),
        assists: playerStats
          .filter((player) => player.assists > 0)
          .sort((a, b) => b.assists - a.assists || b.goals - a.goals)
          .slice(0, 10),
      },
      updatedAt: new Date(
        Math.max(
          tournament.updatedAt.getTime(),
          ...matches.map((match) => match.updatedAt.getTime()),
          ...registrations.map((registration) =>
            Math.max(registration.updatedAt.getTime(), registration.team.updatedAt.getTime()),
          ),
        ),
      ).toISOString(),
    }
  }

  async getTeamDashboard(
    organizationId: string,
    teamId: string,
    tournamentId?: string,
    authorization?: string,
  ) {
    return this.prisma.$transaction(
      (prisma) =>
        this.getTeamDashboardSnapshot(organizationId, teamId, tournamentId, authorization, prisma),
      { isolationLevel: 'RepeatableRead' },
    )
  }

  private async getTeamDashboardSnapshot(
    organizationId: string,
    teamId: string,
    tournamentId: string | undefined,
    authorization: string | undefined,
    prisma: Prisma.TransactionClient,
  ) {
    const session = await this.authService.getSession(authorization)
    const viewerUserId = session?.organizationId === organizationId ? session.userId : undefined
    const blocked = await blockedUserIds(prisma, organizationId, viewerUserId)
    const selectedTournament = await this.getFeaturedTournament(
      organizationId,
      tournamentId,
      prisma,
    )
    const selectedTournamentId = selectedTournament.id
    const resultContext = await this.resultContext(organizationId, selectedTournament, prisma)
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        organizationId,
      },
      include: {
        memberships: {
          where: { organizationId, status: 'ACTIVE', playerProfileId: { not: null } },
          include: { playerProfile: true },
          orderBy: { joinedAt: 'asc' },
        },
        registrations: {
          where: { organizationId, tournamentId: selectedTournamentId, status: 'APPROVED' },
          include: { group: true },
          take: 1,
        },
        rosterSnapshots: {
          where: {
            organizationId,
            tournamentId: selectedTournamentId,
            lockedAt: { not: null },
            teamRegistration: { status: 'APPROVED' },
          },
          orderBy: { snapshotVersion: 'desc' },
          take: 1,
          include: { entries: { include: { playerProfile: true }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    })
    if (!team) throw notFound('球队不存在')

    const officialRoster = team.rosterSnapshots[0]?.entries ?? []
    const officialPlayerIds = new Set(officialRoster.map((entry) => entry.playerProfileId))
    const roster = [
      ...officialRoster.map((entry) => ({ ...entry, rosterSource: 'OFFICIAL_SNAPSHOT' as const })),
      ...team.memberships.flatMap((member) =>
        member.playerProfile && !officialPlayerIds.has(member.playerProfile.id)
          ? [
              {
                playerProfileId: member.playerProfile.id,
                playerProfile: member.playerProfile,
                shirtNumber: null,
                rosterSource: 'TEAM_MEMBERSHIP' as const,
              },
            ]
          : [],
      ),
    ]
    const playerIds = roster.map((entry) => entry.playerProfileId)
    const [matches, events, appearances, teamPosts, memberships] = await Promise.all([
      prisma.match.findMany({
        where: {
          organizationId,
          tournamentId: selectedTournamentId,
          status: { not: 'DRAFT' },
          OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
        },
        include: matchSummaryInclude,
        orderBy: { scheduledStartAt: 'asc' },
      }),
      prisma.matchEvent.findMany({
        where: {
          organizationId,
          match: resultContext.matchWhere,
          OR: [{ playerId: { in: playerIds } }, { relatedPlayerId: { in: playerIds } }],
        },
        include: { player: true, relatedPlayer: true, team: true },
      }),
      prisma.matchAppearance.findMany({
        where: {
          organizationId,
          match: resultContext.matchWhere,
          playerId: { in: playerIds },
        },
        include: { player: true, team: true },
      }),
      prisma.post.findMany({
        where: {
          ...visiblePostWhere(blocked),
          organizationId,
          tournamentId: selectedTournamentId,
          OR: [{ teamId: team.id }, { tags: { some: { organizationId, teamId: team.id } } }],
          status: PostStatus.PUBLISHED,
        },
        include: postSummaryInclude(viewerUserId, blocked),
        orderBy: { publishedAt: 'desc' },
        take: 20,
      }),
      prisma.teamMembership.findMany({
        where: {
          organizationId,
          teamId: team.id,
          status: 'ACTIVE',
          playerProfileId: { in: playerIds },
        },
        select: { playerProfileId: true, position: true },
      }),
    ])
    const stats =
      resultContext.official && resultContext.rules
        ? calculateOfficialTeamRecord(
            team.id,
            resultContext.official.confirmedResults.map((fact) => ({
              ...fact,
              playedAt: new Date(fact.playedAt),
            })),
            resultContext.rules,
          )
        : calculateTeamRecord(team.id, matches)
    const playerStats = new Map(
      buildPlayerStats(events, appearances).map((item) => [item.id, item]),
    )
    const now = Date.now()
    const fixedCaptain = (await fixedCaptainFacts(prisma, organizationId, [team.id]))[0]
    const memberPositions = new Map(
      memberships.map((membership) => [membership.playerProfileId, membership.position]),
    )

    return {
      team: {
        ...mapTeam(withSeasonTeamProfile(team, team.registrations[0]?.teamProfileSnapshot)),
        description: withSeasonTeamProfile(team, team.registrations[0]?.teamProfileSnapshot)
          .description,
        motto: withSeasonTeamProfile(team, team.registrations[0]?.teamProfileSnapshot).motto,
        foundedYear: team.foundedYear,
        coverUrl: defaultCover('team', team.coverUrl),
        coachName: team.registrations[0]?.coachDisplayName ?? null,
        captainName: team.registrations[0]?.leaderDisplayName ?? null,
        captainPlayerId: fixedCaptain?.playerId ?? null,
        groupName: team.registrations[0]?.group?.name ?? null,
      },
      stats,
      rosterSource:
        officialRoster.length > 0
          ? roster.length > officialRoster.length
            ? 'MIXED'
            : 'OFFICIAL_SNAPSHOT'
          : 'TEAM_MEMBERSHIP',
      resultsMode: resultContext.mode,
      posts: teamPosts.map((post) => mapPost(post, viewerUserId)),
      recentMatches: matches
        .filter((match) => match.status === MatchStatus.FINISHED)
        .reverse()
        .map((match) => mapResultMatch(match, resultContext.official)),
      upcomingMatches: matches
        .filter(
          (match) =>
            (match.scheduledStartAt?.getTime() ?? 0) > now &&
            match.status === MatchStatus.SCHEDULED,
        )
        .slice(0, 5)
        .map(mapMatch),
      roster: roster.map((entry) => {
        const player = entry.playerProfile
        const stat = playerStats.get(player.id)
        return {
          id: player.id,
          displayName: player.displayName,
          jerseyName: player.jerseyName,
          shirtNumber: entry.shirtNumber,
          rosterSource: entry.rosterSource,
          position: memberPositions.get(player.id) ?? player.position,
          secondaryPosition: player.secondaryPosition,
          academicYear: player.academicYear,
          heightCm: player.heightCm,
          profileColor: player.profileColor,
          avatarUrl: playerAvatar(player),
          appearances: stat?.appearances ?? 0,
          goals: stat?.goals ?? 0,
          assists: stat?.assists ?? 0,
        }
      }),
    }
  }

  async getPlayer(
    organizationId: string,
    playerId: string,
    tournamentId?: string,
    authorization?: string,
  ) {
    const session = await this.authService.getSession(authorization)
    const viewerUserId = session?.organizationId === organizationId ? session.userId : undefined
    return this.prisma.$transaction(
      (prisma) =>
        this.getPlayerSnapshot(organizationId, playerId, tournamentId, prisma, viewerUserId),
      { isolationLevel: 'RepeatableRead' },
    )
  }

  private async getPlayerSnapshot(
    organizationId: string,
    playerId: string,
    tournamentId: string | undefined,
    prisma: Prisma.TransactionClient,
    viewerUserId?: string,
  ) {
    const blocked = await blockedUserIds(prisma, organizationId, viewerUserId)
    const selectedTournament = await this.getFeaturedTournament(
      organizationId,
      tournamentId,
      prisma,
    )
    const selectedTournamentId = selectedTournament.id
    const resultContext = await this.resultContext(organizationId, selectedTournament, prisma)
    const snapshotScope = {
      organizationId,
      tournamentId: selectedTournamentId,
      lockedAt: { not: null },
      teamRegistration: {
        organizationId,
        tournamentId: selectedTournamentId,
        status: 'APPROVED' as const,
      },
    }
    const player = await prisma.playerProfile.findFirst({
      where: {
        id: playerId,
        organizationId,
        OR: [
          { snapshotEntries: { some: { organizationId, rosterSnapshot: snapshotScope } } },
          {
            teamMemberships: {
              some: { organizationId, status: 'ACTIVE', team: { organizationId } },
            },
          },
        ],
      },
      include: {
        linkedUser: { select: publicIdentitySelect },
        teamMemberships: {
          where: { organizationId, status: 'ACTIVE', team: { organizationId } },
          include: { team: true },
          orderBy: { joinedAt: 'desc' },
          take: 1,
        },
        snapshotEntries: {
          where: {
            organizationId,
            rosterSnapshot: snapshotScope,
          },
          include: {
            rosterSnapshot: {
              include: {
                team: true,
                tournament: true,
                entries: {
                  include: { playerProfile: { select: { position: true, avatarUrl: true } } },
                },
              },
            },
          },
          orderBy: { rosterSnapshot: { snapshotVersion: 'desc' } },
          take: 1,
        },
      },
    })
    if (!player) throw notFound('球员不存在')

    const [events, appearances] = await Promise.all([
      prisma.matchEvent.findMany({
        where: {
          organizationId,
          match: resultContext.matchWhere,
          OR: [{ playerId }, { relatedPlayerId: playerId }],
        },
        include: { player: true, relatedPlayer: true, team: true },
      }),
      prisma.matchAppearance.findMany({
        where: {
          organizationId,
          playerId,
          match: resultContext.matchWhere,
        },
        include: { player: true, team: true, match: { include: matchSummaryInclude } },
        orderBy: { match: { scheduledStartAt: 'desc' } },
      }),
    ])
    const stats = buildPlayerStats(events, appearances).find((item) => item.id === playerId)
    const snapshot = player.snapshotEntries[0]
    const teamIds = snapshot
      ? [snapshot.rosterSnapshot.teamId]
      : player.teamMemberships.map((m) => m.teamId)
    const [fixtures, documented, confirmedPlans] = await Promise.all([
      prisma.match.findMany({
        where: { organizationId, tournamentId: selectedTournamentId, status: { not: 'DRAFT' } },
        include: matchSummaryInclude,
        orderBy: [{ scheduledStartAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      }),
      prisma.auditLog.findMany({
        where: {
          organizationId,
          action: {
            in: ['MATCH_DOCUMENT_LINEUP_RECORDED', 'MATCH_DOCUMENT_PARTICIPATION_RECORDED'],
          },
          targetType: 'Match',
          actorType: 'ADMIN',
          source: 'OFFICIAL_MATCH_DOCUMENT',
          afterSummary: { path: ['tournamentId'], equals: selectedTournamentId },
        },
        orderBy: { createdAt: 'desc' },
        select: { targetId: true, afterSummary: true },
      }),
      prisma.teamLineupPlan.findMany({
        where: {
          organizationId,
          tournamentId: selectedTournamentId,
          kind: 'MATCH_LINEUP',
          confirmedAt: { not: null },
        },
        include: {
          confirmedRevision: {
            include: {
              rosterSnapshot: {
                include: {
                  entries: {
                    include: {
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
    const starters = new Map<string, boolean | null>()
    for (const row of documented) {
      if (!row.targetId || starters.has(row.targetId) || !snapshot) continue
      const evidence = row.afterSummary as Record<string, unknown> | null
      if (
        evidence?.matchId === row.targetId &&
        evidence.tournamentId === selectedTournamentId &&
        evidence.teamId === snapshot.rosterSnapshot.teamId &&
        Array.isArray(evidence.playerIds) &&
        evidence.playerIds.includes(playerId)
      ) {
        starters.set(row.targetId, null)
        continue
      }
      const lineup = documentMatchLineup(snapshot.rosterSnapshot.entries, row.afterSummary, {
        matchId: row.targetId,
        teamId: snapshot.rosterSnapshot.teamId,
        tournamentId: selectedTournamentId,
      })
      if (lineup?.players.some((p) => p.id === playerId && p.starter))
        starters.set(row.targetId, true)
    }
    for (const plan of confirmedPlans) {
      const lineup = confirmedMatchLineup(plan, {
        organizationId,
        tournamentId: selectedTournamentId,
        teamId: plan.teamId,
      })
      if (
        plan.matchId &&
        !starters.has(plan.matchId) &&
        lineup?.players.some((p) => p.id === playerId && p.starter)
      )
        starters.set(plan.matchId, true)
    }
    const schedule = playerSchedule(fixtures, teamIds, playerId, appearances, events, starters)
    const playerStats = stats ?? emptyPlayerStats(player.id, player.displayName)
    const finished = schedule.filter(
      (row) => row.participationConfirmed && row.match.status === 'FINISHED',
    )
    playerStats.appearances = Math.max(playerStats.appearances, finished.length)
    playerStats.starts = Math.max(
      playerStats.starts,
      finished.filter((row) => row.starter === true).length,
    )
    const account =
      player.linkedUser?.status === 'ACTIVE' &&
      player.linkedUser.memberships.some(
        (item) => item.organizationId === organizationId && item.status === 'ACTIVE',
      )
        ? publicIdentity(player.linkedUser, organizationId, viewerUserId)
        : null
    const posts = await prisma.post.findMany({
      where: {
        ...identityPostWhere(organizationId, account?.id ?? null, playerId),
        ...visiblePostWhere(blocked),
      },
      include: postSummaryInclude(viewerUserId, blocked),
      orderBy: { publishedAt: 'desc' },
      take: 50,
    })

    return {
      id: player.id,
      person: account,
      posts: posts.map((post) => mapPost(post, viewerUserId)),
      displayName: player.displayName,
      jerseyName: player.jerseyName,
      shirtNumber: snapshot?.shirtNumber ?? null,
      position: player.position,
      secondaryPosition: player.secondaryPosition,
      dominantFoot: player.dominantFoot,
      heightCm: player.heightCm,
      academicYear: player.academicYear,
      major: player.major,
      hometown: player.hometown,
      bio: player.bio,
      profileColor: player.profileColor,
      avatarUrl: defaultAvatar('player', player.id, player.avatarUrl),
      portraitUrl: player.portraitUrl,
      coverUrl: defaultCover('player', player.coverUrl),
      isDemo: player.isDemo,
      abilities: {
        shooting: player.ratingShooting,
        speed: player.ratingSpeed,
        dribbling: player.ratingDribbling,
        passing: player.ratingPassing,
        defending: player.ratingDefending,
      },
      team: snapshot
        ? mapTeam(snapshot.rosterSnapshot.team)
        : player.teamMemberships[0]
          ? mapTeam(player.teamMemberships[0].team)
          : null,
      rosterSource: snapshot ? 'OFFICIAL_SNAPSHOT' : 'TEAM_MEMBERSHIP',
      tournamentName: snapshot?.rosterSnapshot.tournament.name ?? null,
      stats: playerStats,
      resultsMode: resultContext.mode,
      appearanceRecording: resultContext.mode === 'DEMO' ? 'DEMO' : 'EXISTING_MATCH_RECORDS',
      recentMatches: schedule.map(({ match, starter, minutesPlayed, appearanceRecorded }) => ({
        ...mapResultMatch(match, resultContext.official),
        starter,
        minutesPlayed,
        appearanceRecorded,
      })),
    }
  }

  async getPerson(
    organizationId: string,
    userId: string,
    tournamentId?: string,
    authorization?: string,
  ) {
    if (
      userId !== 'official' &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
    )
      throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
        code: ERROR_CODES.BAD_REQUEST,
        message: '人物标识不可用',
      })
    const session = await this.authService.getSession(authorization)
    const blocked = await blockedUserIds(
      this.prisma,
      organizationId,
      session?.organizationId === organizationId ? session.userId : undefined,
    )
    return this.prisma.$transaction(
      async (prisma) => {
        const tournament = await this.getFeaturedTournament(organizationId, tournamentId, prisma)
        const membership =
          userId === 'official'
            ? null
            : await prisma.organizationMembership.findFirst({
                where: { organizationId, userId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
                include: {
                  user: { select: publicIdentitySelect },
                  organization: { select: { name: true } },
                },
              })
        if (userId !== 'official' && !membership) throw notFound('人物资料不可用')
        const user = membership?.user
        let player: Awaited<ReturnType<ExperienceService['getPlayerSnapshot']>> | null = null
        if (
          user?.playerProfile?.organizationId === organizationId &&
          user.showPlayerIdentity !== false
        ) {
          try {
            player = await this.getPlayerSnapshot(
              organizationId,
              user.playerProfile.id,
              tournament.id,
              prisma,
              session?.userId,
            )
          } catch (error) {
            if (!(error instanceof ApiHttpException) || error.getStatus() !== HttpStatus.NOT_FOUND)
              throw error
          }
        }
        const posts = (
          await prisma.post.findMany({
            where: {
              ...identityPostWhere(
                organizationId,
                user?.id ?? null,
                user?.playerProfile?.organizationId === organizationId
                  ? user.playerProfile.id
                  : null,
              ),
              ...visiblePostWhere(blocked),
            },
            include: postSummaryInclude(session?.userId, blocked),
            orderBy: { publishedAt: 'desc' },
            take: 50,
          })
        ).map((post) => mapPost(post, session?.userId))
        return {
          ...(user ? publicIdentity(user, organizationId, session?.userId) : officialIdentity),
          bio: user?.bio ?? null,
          organizationName: membership?.organization.name ?? null,
          player,
          posts,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
        }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }

  async getMatchExperience(organizationId: string, matchId: string, authorization?: string) {
    return this.prisma.$transaction(
      (prisma) => this.getMatchExperienceSnapshot(organizationId, matchId, authorization, prisma),
      { isolationLevel: 'RepeatableRead' },
    )
  }

  private async getMatchExperienceSnapshot(
    organizationId: string,
    matchId: string,
    authorization: string | undefined,
    prisma: Prisma.TransactionClient,
  ) {
    const session = await this.authService.getSession(authorization)
    const blocked = await blockedUserIds(
      this.prisma,
      organizationId,
      session?.organizationId === organizationId ? session.userId : undefined,
    )
    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        organizationId,
        status: { not: 'DRAFT' },
        tournament: { organizationId, status: 'PUBLISHED' },
      },
      include: {
        ...matchSummaryInclude,
        tournament: true,
        stage: true,
        group: true,
        round: true,
        events: {
          include: { team: true, player: true, relatedPlayer: true },
          orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
        },
        appearances: {
          include: { player: true, team: true },
          orderBy: [{ teamId: 'asc' }, { starter: 'desc' }, { shirtNumber: 'asc' }],
        },
        reviews: {
          include: { user: { select: publicIdentitySelect } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    })
    if (!match) throw notFound('比赛不存在')
    const resultContext = await this.resultContext(organizationId, match.tournament, prisma)
    const isOfficialFact =
      resultContext.mode === 'DEMO' ||
      resultContext.official?.confirmedResults.some(
        (fact) => fact.id === match.id && fact.status === 'CONFIRMED',
      )
    const confirmedPlans = await prisma.teamLineupPlan.findMany({
      where: {
        organizationId,
        tournamentId: match.tournamentId,
        matchId: match.id,
        kind: 'MATCH_LINEUP',
        confirmedVersion: { not: null },
        teamId: {
          in: [match.homeTeamId, match.awayTeamId].filter((id): id is string => id !== null),
        },
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
                    playerProfile: {
                      select: { position: true, avatarUrl: true, portraitUrl: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    const teamIds = [match.homeTeamId, match.awayTeamId].filter((id): id is string => id !== null)
    const [defaults, rosterSnapshots, captainAssignments, documentLineups] = await Promise.all([
      prisma.teamLineupPlan.findMany({
        where: { organizationId, teamId: { in: teamIds }, kind: 'TACTIC', isDefault: true },
        select: { id: true, teamId: true },
      }),
      prisma.rosterSnapshot.findMany({
        where: {
          organizationId,
          tournamentId: match.tournamentId,
          teamId: { in: teamIds },
          lockedAt: { not: null },
          teamRegistration: { status: 'APPROVED' },
        },
        orderBy: { snapshotVersion: 'desc' },
        include: {
          entries: {
            orderBy: { sortOrder: 'asc' },
            select: {
              playerProfileId: true,
              displayName: true,
              shirtNumber: true,
              playerProfile: { select: { position: true, avatarUrl: true, portraitUrl: true } },
            },
          },
        },
      }),
      prisma.roleAssignment.findMany({
        where: {
          organizationId,
          role: 'TEAM_CAPTAIN',
          scopeType: 'TEAM',
          scopeId: { in: teamIds },
          revokedAt: null,
          user: { status: 'ACTIVE', playerProfile: { organizationId } },
        },
        select: { scopeId: true, user: { select: { playerProfile: { select: { id: true } } } } },
      }),
      prisma.auditLog.findMany({
        where: {
          organizationId,
          action: 'MATCH_DOCUMENT_LINEUP_RECORDED',
          targetType: 'Match',
          targetId: match.id,
          source: 'OFFICIAL_MATCH_DOCUMENT',
          actorType: 'ADMIN',
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { afterSummary: true },
      }),
    ])
    // Read the version explicitly made default, so a subsequent private draft stays private.
    const publications = defaults.length
      ? await prisma.auditLog.findMany({
          where: {
            organizationId,
            action: 'TEAM_DEFAULT_LINEUP_SET',
            targetType: 'TeamLineupPlan',
            targetId: { in: defaults.map((plan) => plan.id) },
          },
          orderBy: { createdAt: 'desc' },
          select: { targetId: true, afterSummary: true },
        })
      : []
    const publishedVersions = defaults.flatMap((plan) => {
      const version = Math.max(
        0,
        ...publications
          .filter((item) => item.targetId === plan.id)
          .map((item) => Number((item.afterSummary as { version?: number } | null)?.version) || 0),
      )
      return Number.isInteger(version) && version > 0 ? [{ planId: plan.id, version }] : []
    })
    const defaultRevisions = publishedVersions.length
      ? await prisma.teamLineupRevision.findMany({
          where: { organizationId, OR: publishedVersions },
          select: { planId: true, payload: true },
        })
      : []
    const viewerReview = session
      ? match.reviews.find((review) => review.userId === session.userId)
      : undefined
    const ratings = summarizeMatchRatings(match.reviews)
    const [fixedCaptains, officials] = await Promise.all([
      fixedCaptainFacts(prisma, organizationId, teamIds),
      matchOfficials(prisma, organizationId, match.id),
    ])
    // 快报: published OFFICIAL posts tagged with this match (TOPIC key `match-report:<id>`).
    const selectedRules = await prisma.competitionRuleVersion.findFirst({
      where: {
        organizationId,
        tournamentId: match.tournamentId,
        ...(match.confirmedReportVersion
          ? {
              reportRevisions: {
                some: {
                  matchId: match.id,
                  version: match.confirmedReportVersion,
                  status: 'CONFIRMED',
                },
              },
            }
          : { status: 'PUBLISHED' }),
      },
      select: { rules: true },
      orderBy: { version: 'desc' },
    })
    const flashReports = await prisma.post.findMany({
      where: {
        ...visiblePostWhere(blocked),
        organizationId,
        type: PostType.OFFICIAL,
        status: PostStatus.PUBLISHED,
        tags: { some: { key: matchReportTagKey(match.id) } },
      },
      include: postSummaryInclude(session?.userId, blocked),
      orderBy: { publishedAt: 'desc' },
      take: 5,
    })

    let canStartClock = clockStartPermission(session, match, Date.now())
    if (canStartClock && session && !clockAdministrator(session, match)) {
      const reporter = await prisma.reporterProfile.findUnique({
        where: { organizationId_userId: { organizationId, userId: session.userId } },
        select: { status: true },
      })
      if (reporter && !['ACTIVE', 'PROBATION'].includes(reporter.status)) canStartClock = false
    }
    return {
      ...mapResultMatch(match, resultContext.official),
      clock: matchClockView(match, selectedRules?.rules, Date.now(), canStartClock),
      flashReports: flashReports.map((post) => mapPost(post, session?.userId)),
      officials,
      periodMinutes: periodMinutes(selectedRules?.rules),
      resultsMode: resultContext.mode,
      summary: resultContext.mode === 'DEMO' ? match.summary : null,
      attendance: match.attendance,
      events: (isOfficialFact ||
      match.confirmedReportVersion !== null ||
      match.status === MatchStatus.LIVE
        ? match.events
        : []
      ).map((event) => ({
        id: event.id,
        type: event.type,
        minute: event.minute,
        stoppageMinute: event.stoppageMinute,
        description: event.description,
        team: mapTeam(event.team),
        player: event.player
          ? { id: event.player.id, displayName: event.player.displayName }
          : null,
        relatedPlayer: event.relatedPlayer
          ? { id: event.relatedPlayer.id, displayName: event.relatedPlayer.displayName }
          : null,
      })),
      lineups: [match.homeTeam, match.awayTeam]
        .filter((team): team is NonNullable<typeof team> => Boolean(team))
        .map((team) => {
          const confirmed = confirmedMatchLineup(
            confirmedPlans.find((plan) => plan.teamId === team.id),
            { organizationId, tournamentId: match.tournamentId, teamId: team.id },
          )
          const teamDefault = defaultMatchLineup(
            rosterSnapshots.find((snapshot) => snapshot.teamId === team.id)?.entries ?? [],
            defaultRevisions.find(
              (revision) =>
                revision.planId === defaults.find((plan) => plan.teamId === team.id)?.id,
            )?.payload,
          )
          const documented = documentLineups
            .map((row) =>
              documentMatchLineup(
                rosterSnapshots.find((snapshot) => snapshot.teamId === team.id)?.entries ?? [],
                row.afterSummary,
                { matchId: match.id, teamId: team.id, tournamentId: match.tournamentId },
              ),
            )
            .find(Boolean)
          const captainPlayerId =
            fixedCaptains.find((fact) => fact.teamId === team.id)?.playerId ??
            confirmed?.captainPlayerId ??
            documented?.captainPlayerId ??
            teamDefault.captainPlayerId
          const appearances = (isOfficialFact ? match.appearances : []).filter(
            (appearance) => appearance.teamId === team.id,
          )
          if (appearances.length)
            return {
              team: mapTeam(team),
              captainPlayerId,
              formation: null,
              lineupSource: 'CONFIRMED_APPEARANCES' as const,
              appearanceRecorded: true,
              confirmedVersion: null,
              confirmedAt: null,
              players: appearances.map((appearance) => ({
                id: appearance.player.id,
                displayName: appearance.player.displayName,
                shirtNumber: appearance.shirtNumber,
                position: appearance.player.position,
                starter: appearance.starter,
                minutesPlayed: appearance.minutesPlayed,
                pitchPosition: null,
                avatarUrl: playerAvatar(appearance.player),
                profileColor: appearance.player.profileColor,
              })),
            }
          return {
            team: mapTeam(team),
            ...(confirmed ?? documented ?? teamDefault),
            captainPlayerId,
          }
        })
        .map((lineup) => ({
          ...lineup,
          players: lineup.players.map((player) => ({
            ...player,
            isCaptain: lineup.captainPlayerId
              ? lineup.captainPlayerId === player.id
              : captainAssignments.some(
                  (assignment) =>
                    assignment.scopeId === lineup.team.id &&
                    assignment.user.playerProfile?.id === player.id,
                ),
          })),
        })),
      reviews: {
        ...ratings,
        viewerReview: viewerReview
          ? { rating: viewerReview.rating, body: viewerReview.body }
          : null,
        comments: match.reviews
          .filter((review) => Boolean(review.body) && !blocked.includes(review.userId))
          .map((review) => ({
            id: review.id,
            rating: review.rating,
            body: review.body!,
            createdAt: review.createdAt.toISOString(),
            author: publicIdentity(review.user, organizationId, session?.userId),
          })),
      },
    }
  }

  async reviewMatch(
    authorization: string | undefined,
    matchId: string,
    input: CreateMatchReviewDto,
  ) {
    const session = await this.authService.requireSession(authorization)
    await saveMatchReview(this.prisma, session.organizationId, session.userId, matchId, input)
    return this.getMatchExperience(session.organizationId, matchId, authorization)
  }

  async suggestPostTags(organizationId: string, query = '', tournamentId?: string) {
    const tournament = await this.getFeaturedTournament(organizationId, tournamentId)
    const normalized = query.normalize('NFKC').replace(/^#+/, '').trim()
    const snapshotScope = {
      organizationId,
      tournamentId: tournament.id,
      lockedAt: { not: null },
      teamRegistration: {
        organizationId,
        tournamentId: tournament.id,
        status: 'APPROVED' as const,
      },
    }
    const [usage, teams, players] = await Promise.all([
      this.prisma.postTag.groupBy({
        by: ['kind', 'key'],
        where: {
          organizationId,
          post: { organizationId, tournamentId: tournament.id, status: PostStatus.PUBLISHED },
        },
        _count: { _all: true },
        _max: { label: true },
        orderBy: { key: 'asc' },
      }),
      this.prisma.team.findMany({
        where: {
          organizationId,
          ...(normalized
            ? {
                OR: [
                  { name: { contains: normalized, mode: 'insensitive' as const } },
                  { shortName: { contains: normalized, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        select: { id: true, name: true, collegeName: true, teamCode: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.playerProfile.findMany({
        where: {
          organizationId,
          snapshotEntries: { some: { organizationId, rosterSnapshot: snapshotScope } },
          ...(normalized
            ? {
                OR: [
                  { displayName: { contains: normalized, mode: 'insensitive' as const } },
                  { jerseyName: { contains: normalized, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          displayName: true,
          snapshotEntries: {
            where: { organizationId, rosterSnapshot: snapshotScope },
            select: {
              shirtNumber: true,
              rosterSnapshot: { select: { team: { select: { name: true } } } },
            },
            orderBy: { rosterSnapshot: { snapshotVersion: 'desc' } },
            take: 1,
          },
        },
        orderBy: { displayName: 'asc' },
      }),
    ])
    const fixedTopics = ['比赛日', '训练日常', '赛后记录', '校园足球']
      .filter((label) => !normalized || label.includes(normalized))
      .map((label) => ({ kind: 'TOPIC' as const, label }))
    const commonTopics = [
      ...usage
        .filter((tag) => tag.kind === 'TOPIC' && tag._max.label)
        .map((tag) => ({ kind: 'TOPIC' as const, label: tag._max.label! }))
        .filter((tag) =>
          tag.label.toLocaleLowerCase('zh-CN').includes(normalized.toLocaleLowerCase('zh-CN')),
        ),
      ...fixedTopics,
    ]
    const seen = new Set<string>()
    const counts = new Map(usage.map((tag) => [tag.key, tag._count._all]))
    const exact = (label: string) =>
      normalized !== '' &&
      label.normalize('NFKC').toLocaleLowerCase('zh-CN') === normalized.toLocaleLowerCase('zh-CN')
    const frequency = (tag: { kind: string; label: string; targetId?: string }) =>
      counts.get(
        tag.kind === 'TOPIC'
          ? `TOPIC:${tag.label.normalize('NFKC').toLocaleLowerCase('zh-CN')}`
          : `${tag.kind}:${tag.targetId}`,
      ) ?? 0
    return {
      items: [
        ...commonTopics.filter((tag) => {
          const key = tag.label.normalize('NFKC').toLocaleLowerCase('zh-CN')
          if (seen.has(key)) return false
          seen.add(key)
          return true
        }),
        ...teams.map((team) => ({
          kind: 'TEAM' as const,
          label: team.name,
          targetId: team.id,
          description: [team.collegeName, team.teamCode].filter(Boolean).join(' · '),
        })),
        ...players.map((player) => ({
          kind: 'PLAYER' as const,
          label: player.displayName,
          targetId: player.id,
          description: `${player.snapshotEntries[0]?.rosterSnapshot.team.name ?? '校园球员'}${player.snapshotEntries[0]?.shirtNumber ? ` · #${player.snapshotEntries[0].shirtNumber}` : ''}`,
        })),
      ]
        .sort(
          (a, b) => Number(exact(b.label)) - Number(exact(a.label)) || frequency(b) - frequency(a),
        )
        .slice(0, 32),
    }
  }

  async listPosts(organizationId: string, authorization?: string, tournamentId?: string) {
    const session = await this.authService.getSession(authorization)
    const blocked = await blockedUserIds(
      this.prisma,
      organizationId,
      session?.organizationId === organizationId ? session.userId : undefined,
    )
    const tournament = await this.getFeaturedTournament(organizationId, tournamentId)
    const posts = await this.prisma.post.findMany({
      where: {
        organizationId,
        tournamentId: tournament.id,
        status: PostStatus.PUBLISHED,
        ...visiblePostWhere(blocked),
      },
      include: postSummaryInclude(session?.userId, blocked),
      orderBy: { publishedAt: 'desc' },
      take: 50,
    })
    return { items: posts.map((post) => mapPost(post, session?.userId)) }
  }

  async getPost(organizationId: string, postId: string, authorization?: string) {
    const session = await this.authService.getSession(authorization)
    const blocked = await blockedUserIds(
      this.prisma,
      organizationId,
      session?.organizationId === organizationId ? session.userId : undefined,
    )
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        organizationId,
        ...visiblePostWhere(blocked),
        ...(session?.organizationId === organizationId
          ? { OR: [{ status: PostStatus.PUBLISHED }, { authorUserId: session.userId }] }
          : { status: PostStatus.PUBLISHED }),
      },
      include: {
        ...postSummaryInclude(session?.userId, blocked),
        comments: {
          where: { hiddenAt: null, ...(blocked.length ? { userId: { notIn: blocked } } : {}) },
          include: commentInclude(session?.userId),
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!post) throw notFound('动态不存在')
    return {
      ...mapPost(post, session?.userId),
      publicationState: post.status === 'PUBLISHED' ? 'PUBLISHED' : 'PENDING_REVIEW',
      comments: post.comments.map((comment) =>
        mapComment(comment, organizationId, session?.userId),
      ),
    }
  }

  async getTeamPreferences(authorization: string | undefined, tournamentId?: string) {
    const session = await this.authService.requireSession(authorization)
    const preferences = await this.prisma.userTeamPreference.findMany({
      where: { organizationId: session.organizationId, userId: session.userId },
      include: { team: true },
      orderBy: [{ isPrimary: 'desc' }, { team: { name: 'asc' } }],
    })
    if (tournamentId) await this.getFeaturedTournament(session.organizationId, tournamentId)
    const available = await this.prisma.team.findMany({
      where: {
        organizationId: session.organizationId,
      },
      orderBy: { name: 'asc' },
    })
    return {
      primaryTeam: preferences.find((item) => item.isPrimary)?.team
        ? mapTeam(preferences.find((item) => item.isPrimary)!.team)
        : null,
      followedTeams: preferences
        .filter((item) => !item.isPrimary)
        .map((item) => mapTeam(item.team)),
      availableTeams: available.map(mapTeam),
    }
  }

  async updateTeamPreferences(authorization: string | undefined, input: UpdateTeamPreferencesDto) {
    const session = await this.authService.requireSession(authorization)
    const requestedIds = [
      ...new Set([...(input.primaryTeamId ? [input.primaryTeamId] : []), ...input.followedTeamIds]),
    ]
    const teams = await this.prisma.team.findMany({
      where: { organizationId: session.organizationId, id: { in: requestedIds } },
    })
    if (teams.length !== requestedIds.length) {
      throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
        code: ERROR_CODES.BAD_REQUEST,
        message: '选择中包含不可用球队',
      })
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userTeamPreference.deleteMany({
        where: { organizationId: session.organizationId, userId: session.userId },
      })
      if (requestedIds.length)
        await tx.userTeamPreference.createMany({
          data: requestedIds.map((teamId) => ({
            organizationId: session.organizationId,
            userId: session.userId,
            teamId,
            isPrimary: teamId === input.primaryTeamId,
          })),
        })
    })
    return this.getTeamPreferences(authorization)
  }

  async createPost(
    authorization: string | undefined,
    input: CreatePostDto,
    requestId = 'unknown',
    publicationSource: 'USER' | 'SYSTEM' = 'USER',
  ) {
    const session = await this.authService.requireSession(authorization)
    const blocked = await blockedUserIds(this.prisma, session.organizationId, session.userId)
    const tournament = await this.getFeaturedTournament(session.organizationId, input.tournamentId)
    const quotedPostId = input.quotedPostId ?? null
    if (
      quotedPostId &&
      !(await this.prisma.post.findFirst({
        where: {
          ...visiblePostWhere(blocked),
          id: quotedPostId,
          organizationId: session.organizationId,
          status: PostStatus.PUBLISHED,
        },
        select: { id: true },
      }))
    )
      throw notFound('要转发的动态不存在或已删除')
    normalizePostTags(input.tags)
    if (input.teamId) {
      const [team, relationship] = await Promise.all([
        this.prisma.team.findFirst({
          where: { id: input.teamId, organizationId: session.organizationId },
          select: { id: true },
        }),
        this.prisma.teamMembership.findFirst({
          where: {
            organizationId: session.organizationId,
            teamId: input.teamId,
            status: 'ACTIVE',
            OR: [
              { userId: session.userId },
              ...(session.user.linkedPlayer
                ? [{ playerProfileId: session.user.linkedPlayer.id }]
                : []),
            ],
          },
          select: { id: true },
        }),
      ])
      if (!team) throw notFound('球队不存在')
      const isManager = session.user.roles.some(
        (role) =>
          role.role === 'PLATFORM_ADMIN' ||
          (role.role === 'ORGANIZATION_ADMIN' &&
            role.scopeType === 'ORGANIZATION' &&
            role.scopeId === session.organizationId) ||
          ((role.role === 'TEAM_CAPTAIN' || role.role === 'TEAM_COACH') &&
            role.scopeType === 'TEAM' &&
            role.scopeId === input.teamId),
      )
      if (!relationship && !isManager) {
        throw new ApiHttpException(HttpStatus.FORBIDDEN, {
          code: ERROR_CODES.FORBIDDEN,
          message: '只有球队成员或队长可以发布球队动态',
        })
      }
    }
    const title = input.title?.trim() || null
    const body = input.body.trim()
    const teamId = input.teamId ?? null
    if (input.imageDataUrl && input.imageDataUrls) throw conflict('请只提交一种图片格式')
    if (input.imageUploadIds?.length && (input.imageDataUrl || input.imageDataUrls?.length))
      throw conflict('请只提交一种图片格式')
    const imageDataUrls = input.imageUploadIds?.length
      ? await this.imageTransfers!.resolveImages(session, input.imageUploadIds, 9)
      : (input.imageDataUrls ?? (input.imageDataUrl ? [input.imageDataUrl] : []))
    if (!body && imageDataUrls.length === 0 && !quotedPostId)
      throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
        code: ERROR_CODES.BAD_REQUEST,
        message: '请填写正文或添加图片',
      })
    const storedImage = await this.mediaService.storePostImages(
      session.organizationId,
      session.userId,
      imageDataUrls,
    )
    const imageUrl = storedImage?.imageUrl ?? null
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const tags = await resolvePostTags(tx, session.organizationId, tournament.id, input.tags)
        const preReview = await this.aiModeration?.requiresPreReview(
          tx,
          session.organizationId,
          'POST',
        )
        const inserted = await tx.post.createMany({
          data: [
            {
              organizationId: session.organizationId,
              tournamentId: tournament.id,
              authorUserId: session.userId,
              clientPostId: input.clientPostId,
              teamId,
              type: PostType.COMMUNITY,
              publicationSource,
              status: preReview ? PostStatus.DRAFT : PostStatus.PUBLISHED,
              title,
              body,
              imageUrl,
              quotedPostId,
            },
          ],
          skipDuplicates: true,
        })
        const post = await tx.post.findUnique({
          where: {
            authorUserId_clientPostId: {
              authorUserId: session.userId,
              clientPostId: input.clientPostId,
            },
          },
          include: postSummaryInclude(session.userId, blocked),
        })
        if (
          !post ||
          post.organizationId !== session.organizationId ||
          post.tournamentId !== tournament.id ||
          post.teamId !== teamId ||
          post.title !== title ||
          post.body !== body ||
          post.imageUrl !== imageUrl ||
          post.quotedPostId !== quotedPostId
        ) {
          throw conflict('同一提交编号已用于其他动态内容，请重新发布')
        }
        if (
          inserted.count === 0 &&
          postTagFingerprint(post.tags ?? []) !== postTagFingerprint(tags)
        ) {
          throw conflict('同一提交编号已用于其他动态标签，请重新发布')
        }
        if (inserted.count === 1) {
          if (tags.length)
            await tx.postTag.createMany({
              data: tags.map((tag) => ({
                ...tag,
                organizationId: session.organizationId,
                postId: post.id,
              })),
            })
          await tx.auditLog.create({
            data: {
              organizationId: session.organizationId,
              actorType: AuditActorType.USER,
              actorUserId: session.userId,
              actorRoleSnapshot: session.user.roles.map(({ role, scopeType, scopeId }) => ({
                role,
                scopeType,
                scopeId,
              })),
              action: 'COMMUNITY_POST_CREATED',
              targetType: 'Post',
              targetId: post.id,
              afterSummary: {
                title,
                teamId,
                hasImage: Boolean(imageUrl),
                imageCount: imageDataUrls.length,
                quotedPostId,
                tags: mapPostTags(tags),
              },
              reason: '用户发布校园足球动态',
              requestId,
              source: 'API',
            },
          })
        }
        if (inserted.count === 1 && !preReview) {
          const ids = tags.flatMap((tag) => (tag.playerId ? [tag.playerId] : []))
          if (ids.length) {
            const mentioned = await tx.playerProfile.findMany({
              where: {
                organizationId: session.organizationId,
                id: { in: ids },
                linkedUser: {
                  is: {
                    status: 'ACTIVE',
                    memberships: {
                      some: { organizationId: session.organizationId, status: 'ACTIVE' },
                    },
                  },
                },
              },
              select: { linkedUser: { select: { id: true } } },
            })
            for (const player of mentioned)
              if (player.linkedUser)
                await this.socialService.notify(
                  {
                    organizationId: session.organizationId,
                    actorUserId: session.userId,
                    recipientUserId: player.linkedUser.id,
                    type: NotificationType.POST_COMMENTED,
                    title: '有人在动态中提到了你',
                    body: `${session.user.displayName} 在动态中提到了你：${body.slice(0, 160)}`,
                    linkPath: `/pages/post-detail/index?postId=${encodeURIComponent(post.id)}`,
                    metadata: { messageCategory: 'mentions', postId: post.id, targetKind: 'POST' },
                    deduplicationKey: `post-mentioned:${post.id}:${player.linkedUser.id}`,
                  },
                  tx,
                )
          }
        }
        if (inserted.count === 1)
          await this.aiModeration?.enqueue(tx, session.organizationId, 'POST', post.id)
        return {
          ...mapPost(inserted.count === 1 ? { ...post, tags } : post, session.userId),
          publicationState: post.status === 'PUBLISHED' ? 'PUBLISHED' : 'PENDING_REVIEW',
        }
      })
      await this.imageTransfers?.completeImages(session, input.imageUploadIds ?? [])
      return result
    } catch (error) {
      if (imageUrl) await this.mediaService.cleanupPostImageIfUnreferenced(imageUrl)
      throw error
    }
  }

  async setLike(authorization: string | undefined, postId: string, liked: boolean) {
    const session = await this.authService.requireSession(authorization)
    const blocked = await blockedUserIds(this.prisma, session.organizationId, session.userId)
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        organizationId: session.organizationId,
        status: PostStatus.PUBLISHED,
        ...visiblePostWhere(blocked),
      },
    })
    if (!post) throw notFound('动态不存在')
    return this.prisma.$transaction(async (tx) => {
      if (liked) {
        const storedLike = await tx.postLike.upsert({
          where: { postId_userId: { postId, userId: session.userId } },
          create: {
            organizationId: session.organizationId,
            postId,
            userId: session.userId,
          },
          update: {},
        })
        if (post.authorUserId) {
          await this.socialService.notify(
            {
              actorUserId: session.userId,
              body: `${session.user.displayName} 点赞了你的动态`,
              deduplicationKey: `post-like:${storedLike.id}`,
              linkPath: `/pages/post-detail/index?postId=${encodeURIComponent(postId)}`,
              organizationId: session.organizationId,
              recipientUserId: post.authorUserId,
              title: '动态收到新的点赞',
              type: NotificationType.POST_LIKED,
              metadata: { postId, targetKind: 'POST' },
            },
            tx,
          )
        }
      } else {
        await tx.postLike.deleteMany({
          where: { postId, userId: session.userId, organizationId: session.organizationId },
        })
      }
      return {
        liked,
        likeCount: await tx.postLike.count({ where: { postId } }),
      }
    })
  }

  async createComment(authorization: string | undefined, postId: string, input: CreateCommentDto) {
    const session = await this.authService.requireSession(authorization)
    const blocked = await blockedUserIds(this.prisma, session.organizationId, session.userId)
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        organizationId: session.organizationId,
        status: PostStatus.PUBLISHED,
        ...visiblePostWhere(blocked),
      },
    })
    if (!post) throw notFound('动态不存在')

    const parent = input.parentCommentId
      ? await this.prisma.postComment.findFirst({
          where: {
            id: input.parentCommentId,
            postId,
            organizationId: session.organizationId,
            hiddenAt: null,
            ...(blocked.length ? { userId: { notIn: blocked } } : {}),
          },
          include: { user: { select: publicIdentitySelect } },
        })
      : null
    if (input.parentCommentId && !parent) throw notFound('要回复的评论不存在')

    const body = input.body.trim()
    const parentCommentId = parent?.id ?? null
    const recipientUserId = parent?.userId ?? post.authorUserId
    if (input.imageUploadIds?.length && input.imageDataUrls?.length)
      throw conflict('请只提交一种图片格式')
    const images = input.imageUploadIds?.length
      ? await this.imageTransfers!.resolveImages(session, input.imageUploadIds, 3)
      : (input.imageDataUrls ?? [])
    if (images.length > 3 || body.length > 300 || (!body && images.length === 0))
      throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
        code: ERROR_CODES.BAD_REQUEST,
        message: '评论需有文字或图片，文字最多 300 字、图片最多 3 张',
      })
    const submissionHash = createHash('sha256')
      .update(
        JSON.stringify({
          postId,
          body,
          parentCommentId,
          repostToFeed: Boolean(input.repostToFeed),
          images,
        }),
      )
      .digest('hex')
    const previous = await this.prisma.postComment.findUnique({
      where: {
        userId_clientCommentId: { userId: session.userId, clientCommentId: input.clientCommentId },
      },
    })
    if (previous?.submissionHash && previous.submissionHash !== submissionHash)
      throw conflict('同一提交编号已用于其他评论内容，请重新发布')
    const imageUrl =
      previous?.submissionHash === submissionHash
        ? previous.imageUrl
        : ((await this.mediaService.storePostImages(session.organizationId, session.userId, images))
            ?.imageUrl ?? null)
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await assertInteractionAllowed(tx, session.organizationId, session.userId, [
          post.authorUserId,
          parent?.userId,
        ])
        const preReview = await this.aiModeration?.requiresPreReview(
          tx,
          session.organizationId,
          'COMMENT',
        )
        const inserted = await tx.postComment.createMany({
          data: [
            {
              organizationId: session.organizationId,
              postId,
              userId: session.userId,
              parentCommentId,
              clientCommentId: input.clientCommentId,
              hiddenAt: preReview ? new Date() : null,
              body,
              imageUrl,
              submissionHash,
            },
          ],
          skipDuplicates: true,
        })
        const stored = await tx.postComment.findUnique({
          where: {
            userId_clientCommentId: {
              userId: session.userId,
              clientCommentId: input.clientCommentId,
            },
          },
          include: commentInclude(session.userId),
        })
        if (
          !stored ||
          stored.organizationId !== session.organizationId ||
          stored.postId !== postId ||
          stored.parentCommentId !== parentCommentId ||
          stored.body !== body ||
          (stored.imageUrl ?? null) !== imageUrl ||
          (stored.submissionHash && stored.submissionHash !== submissionHash)
        ) {
          throw conflict('同一提交编号已用于其他评论内容，请重新发布')
        }
        const clientPostId = `comment-repost:${stored.id}`
        let repostedPost = await tx.post.findUnique({
          where: { authorUserId_clientPostId: { authorUserId: session.userId, clientPostId } },
          include: postSummaryInclude(session.userId, blocked),
        })
        if (inserted.count === 0 && Boolean(repostedPost) !== Boolean(input.repostToFeed)) {
          throw conflict('同一提交编号已用于不同的同步转发选项，请重新发布')
        }
        if (input.repostToFeed && !repostedPost) {
          const repostPreReview =
            preReview ||
            (await this.aiModeration?.requiresPreReview(tx, session.organizationId, 'POST'))
          repostedPost = await tx.post.create({
            data: {
              organizationId: session.organizationId,
              authorUserId: session.userId,
              tournamentId: post.tournamentId,
              clientPostId,
              quotedPostId: post.id,
              body,
              imageUrl,
              type: PostType.COMMUNITY,
              publicationSource: 'USER',
              status: repostPreReview ? PostStatus.DRAFT : PostStatus.PUBLISHED,
            },
            include: postSummaryInclude(session.userId, blocked),
          })
          await tx.auditLog.create({
            data: {
              organizationId: session.organizationId,
              actorType: AuditActorType.USER,
              actorUserId: session.userId,
              actorRoleSnapshot: session.user.roles.map(({ role, scopeType, scopeId }) => ({
                role,
                scopeType,
                scopeId,
              })),
              action: 'COMMUNITY_POST_CREATED',
              targetType: 'Post',
              targetId: repostedPost.id,
              afterSummary: { quotedPostId: post.id, sourceCommentId: stored.id, tags: [] },
              requestId: input.clientCommentId,
              source: 'API',
              reason: '评论同步转发到动态',
            },
          })
        }
        if (recipientUserId && !preReview && inserted.count === 1) {
          await this.socialService.notify(
            {
              actorUserId: session.userId,
              body: stored.body.slice(0, 160),
              deduplicationKey: `post-comment:${stored.id}`,
              linkPath: `/pages/post-detail/index?postId=${encodeURIComponent(postId)}`,
              organizationId: session.organizationId,
              recipientUserId,
              title: parent ? '有人回复了你的评论' : '你的动态收到新评论',
              type: parent ? NotificationType.COMMENT_REPLIED : NotificationType.POST_COMMENTED,
              metadata: { postId, commentId: stored.id, targetKind: 'COMMENT' },
            },
            tx,
          )
        }
        if (inserted.count === 1)
          await this.aiModeration?.enqueue(tx, session.organizationId, 'COMMENT', stored.id)
        if (repostedPost && inserted.count === 1)
          await this.aiModeration?.enqueue(tx, session.organizationId, 'POST', repostedPost.id)
        return { comment: stored, repostedPost }
      })
      const mappedComment = {
        ...mapComment(result.comment, session.organizationId, session.userId),
        ...(input.repostToFeed
          ? {
              repostedPost:
                result.repostedPost?.status === PostStatus.PUBLISHED
                  ? mapPost(result.repostedPost, session.userId)
                  : null,
            }
          : {}),
      }
      await this.imageTransfers?.completeImages(session, input.imageUploadIds ?? [])
      return mappedComment
    } catch (error) {
      if (imageUrl) await this.mediaService.cleanupPostImageIfUnreferenced(imageUrl)
      throw error
    }
  }

  async listFavoritePosts(authorization: string | undefined, before?: string, limit = 30) {
    const session = await this.authService.requireSession(authorization)
    const blocked = await blockedUserIds(this.prisma, session.organizationId, session.userId)
    const where = { organizationId: session.organizationId, userId: session.userId }
    const anchor = before
      ? (decodeFavoriteCursor(before, session.organizationId, session.userId) ??
        (await this.prisma.postFavorite.findFirst({
          where: { ...where, id: before },
          select: { id: true, createdAt: true },
        })))
      : null
    if (before && !anchor) throw notFound('收藏游标不存在')
    const visible = {
      organizationId: session.organizationId,
      status: PostStatus.PUBLISHED,
      ...visiblePostWhere(blocked),
    }
    const [favorites, totalCount] = await Promise.all([
      this.prisma.postFavorite.findMany({
        where: {
          ...where,
          post: {
            organizationId: session.organizationId,
            status: PostStatus.PUBLISHED,
            ...visiblePostWhere(blocked),
          },
          ...(anchor
            ? {
                OR: [
                  { createdAt: { lt: anchor.createdAt } },
                  { createdAt: anchor.createdAt, id: { lt: anchor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: { post: { include: postSummaryInclude(session.userId, blocked) } },
      }),
      this.prisma.postFavorite.count({ where: { ...where, post: visible } }),
    ])
    return {
      items: favorites
        .slice(0, limit)
        .map(({ post }) => ({ ...mapPost(post, session.userId), favoritedByMe: true })),
      nextCursor:
        favorites.length > limit
          ? encodeFavoriteCursor(favorites[limit - 1]!, session.organizationId, session.userId)
          : null,
      totalCount,
    }
  }

  async setPostFavorite(authorization: string | undefined, postId: string, favorited: boolean) {
    const session = await this.authService.requireSession(authorization)
    const blocked = await blockedUserIds(this.prisma, session.organizationId, session.userId)
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: {
          id: postId,
          organizationId: session.organizationId,
          status: PostStatus.PUBLISHED,
          ...visiblePostWhere(blocked),
        },
        select: { id: true },
      })
      if (!post) throw notFound('动态不存在')
      if (favorited)
        await tx.postFavorite.upsert({
          where: { postId_userId: { postId, userId: session.userId } },
          create: { organizationId: session.organizationId, postId, userId: session.userId },
          update: {},
        })
      else
        await tx.postFavorite.deleteMany({
          where: { organizationId: session.organizationId, postId, userId: session.userId },
        })
      return { favorited }
    })
  }

  async setCommentLike(
    authorization: string | undefined,
    postId: string,
    commentId: string,
    liked: boolean,
  ) {
    const session = await this.authService.requireSession(authorization)
    const blocked = await blockedUserIds(this.prisma, session.organizationId, session.userId)
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.postComment.findFirst({
        where: {
          id: commentId,
          postId,
          organizationId: session.organizationId,
          hiddenAt: null,
          ...(blocked.length ? { userId: { notIn: blocked } } : {}),
          post: {
            status: PostStatus.PUBLISHED,
            organizationId: session.organizationId,
            ...visiblePostWhere(blocked),
          },
        },
        select: { id: true, userId: true },
      })
      if (!comment) throw notFound('评论不存在')
      if (liked) {
        const inserted = await tx.postCommentLike.createMany({
          data: [{ organizationId: session.organizationId, commentId, userId: session.userId }],
          skipDuplicates: true,
        })
        if (inserted.count)
          await this.socialService.notify(
            {
              organizationId: session.organizationId,
              recipientUserId: comment.userId,
              actorUserId: session.userId,
              type: NotificationType.POST_LIKED,
              title: '评论收到新的点赞',
              body: `${session.user.displayName} 点赞了你的评论`,
              linkPath: `/pages/post-detail/index?postId=${postId}`,
              metadata: { postId, commentId, targetKind: 'COMMENT' },
              deduplicationKey: `comment-like:${commentId}:${session.userId}`,
            },
            tx,
          )
      } else
        await tx.postCommentLike.deleteMany({
          where: { organizationId: session.organizationId, commentId, userId: session.userId },
        })
      return {
        liked,
        likeCount: await tx.postCommentLike.count({
          where: { organizationId: session.organizationId, commentId },
        }),
      }
    })
  }

  async updatePost(
    authorization: string | undefined,
    postId: string,
    input: UpdatePostDto,
    requestId: string,
  ) {
    const session = await this.authService.requireSession(authorization)
    await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: { id: postId, organizationId: session.organizationId, status: PostStatus.PUBLISHED },
      })
      if (!post) throw notFound('动态不存在')
      if (post.authorUserId !== session.userId) throw forbidden('只能编辑自己发布的动态')
      const body = input.body.trim()
      if (!body && !post.imageUrl && !post.quotedPostId) throw conflict('请保留正文、图片或引用')
      if (post.body === body) return
      if (post.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw conflict('动态已发生变化，请刷新后编辑')
      const preReview = await this.aiModeration?.requiresPreReview(
        tx,
        session.organizationId,
        'POST',
      )
      const changed = await tx.post.updateMany({
        where: {
          id: postId,
          organizationId: session.organizationId,
          authorUserId: session.userId,
          status: PostStatus.PUBLISHED,
          updatedAt: post.updatedAt,
        },
        data: {
          body,
          updatedAt: nextContentVersion(post.updatedAt),
          ...(preReview ? { status: PostStatus.DRAFT } : {}),
        },
      })
      if (changed.count !== 1) throw conflict('动态已发生变化，请刷新后编辑')
      await this.aiModeration?.enqueue(tx, session.organizationId, 'POST', postId)
      await contentAudit(
        tx,
        session,
        'COMMUNITY_POST_UPDATED',
        'Post',
        postId,
        { body: post.body },
        { body },
        requestId,
      )
    })
    return this.getPost(session.organizationId, postId, authorization)
  }

  async deletePost(
    authorization: string | undefined,
    postId: string,
    input: ContentVersionDto,
    requestId: string,
  ) {
    const session = await this.authService.requireSession(authorization)
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: { id: postId, organizationId: session.organizationId },
      })
      if (!post) throw notFound('动态不存在')
      if (post.authorUserId !== session.userId) throw forbidden('只能删除自己发布的动态')
      if (post.status === PostStatus.HIDDEN) return { deleted: true }
      if (post.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw conflict('动态已发生变化，请刷新后删除')
      const changed = await tx.post.updateMany({
        where: {
          id: postId,
          organizationId: session.organizationId,
          authorUserId: session.userId,
          status: PostStatus.PUBLISHED,
          updatedAt: post.updatedAt,
        },
        data: { status: PostStatus.HIDDEN, updatedAt: nextContentVersion(post.updatedAt) },
      })
      if (changed.count !== 1) throw conflict('动态已发生变化，请刷新后删除')
      await contentAudit(
        tx,
        session,
        'COMMUNITY_POST_DELETED',
        'Post',
        postId,
        { status: post.status },
        { status: PostStatus.HIDDEN },
        requestId,
      )
      return { deleted: true }
    })
  }

  async updateComment(
    authorization: string | undefined,
    postId: string,
    commentId: string,
    input: UpdateCommentDto,
    requestId: string,
  ) {
    const session = await this.authService.requireSession(authorization)
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.postComment.findFirst({
        where: {
          id: commentId,
          postId,
          organizationId: session.organizationId,
          hiddenAt: null,
          post: { status: PostStatus.PUBLISHED },
        },
        include: {
          ...commentInclude(session.userId),
          post: { select: { authorUserId: true } },
          parentComment: { select: { userId: true } },
        },
      })
      if (!comment) throw notFound('评论不存在')
      if (comment.userId !== session.userId) throw forbidden('只能编辑自己的评论')
      await assertInteractionAllowed(tx, session.organizationId, session.userId, [
        comment.post.authorUserId,
        comment.parentComment?.userId,
      ])
      const body = input.body.trim()
      if (comment.body === body) return mapComment(comment, session.organizationId, session.userId)
      if (comment.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw conflict('评论已发生变化，请刷新后编辑')
      const preReview = await this.aiModeration?.requiresPreReview(
        tx,
        session.organizationId,
        'COMMENT',
      )
      const updatedAt = nextContentVersion(comment.updatedAt)
      const changed = await tx.postComment.updateMany({
        where: {
          id: commentId,
          postId,
          organizationId: session.organizationId,
          userId: session.userId,
          hiddenAt: null,
          updatedAt: comment.updatedAt,
        },
        data: { body, updatedAt, ...(preReview ? { hiddenAt: new Date() } : {}) },
      })
      if (changed.count !== 1) throw conflict('评论已发生变化，请刷新后编辑')
      await this.aiModeration?.enqueue(tx, session.organizationId, 'COMMENT', commentId)
      await contentAudit(
        tx,
        session,
        'COMMUNITY_COMMENT_UPDATED',
        'PostComment',
        commentId,
        { body: comment.body },
        { body },
        requestId,
      )
      return mapComment({ ...comment, body, updatedAt }, session.organizationId, session.userId)
    })
  }

  async deleteComment(
    authorization: string | undefined,
    postId: string,
    commentId: string,
    input: ContentVersionDto,
    requestId: string,
  ) {
    const session = await this.authService.requireSession(authorization)
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.postComment.findFirst({
        where: {
          id: commentId,
          postId,
          organizationId: session.organizationId,
          post: { status: PostStatus.PUBLISHED },
        },
      })
      if (!comment) throw notFound('评论不存在')
      if (comment.userId !== session.userId) throw forbidden('只能删除自己的评论')
      if (comment.hiddenAt) return { deleted: true }
      if (comment.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw conflict('评论已发生变化，请刷新后删除')
      const changed = await tx.postComment.updateMany({
        where: {
          id: commentId,
          postId,
          organizationId: session.organizationId,
          userId: session.userId,
          hiddenAt: null,
          updatedAt: comment.updatedAt,
        },
        data: { hiddenAt: new Date(), updatedAt: nextContentVersion(comment.updatedAt) },
      })
      if (changed.count !== 1) throw conflict('评论已发生变化，请刷新后删除')
      await contentAudit(
        tx,
        session,
        'COMMUNITY_COMMENT_DELETED',
        'PostComment',
        commentId,
        { hidden: false },
        { hidden: true },
        requestId,
      )
      return { deleted: true }
    })
  }

  private async getFeaturedTournament(
    organizationId: string,
    tournamentId?: string,
    prisma: Pick<PrismaService, 'tournament'> = this.prisma,
    selection?: { competitionDefinitionId?: string | undefined; seasonId?: string | undefined },
  ) {
    return selectPublicTournament(prisma, organizationId, tournamentId, selection)
  }

  private async resultContext(
    organizationId: string,
    tournament: { id: string; tournamentCode: string },
    prisma: Prisma.TransactionClient,
  ) {
    const legacyDemo =
      isDemoFixtureOrganization(organizationId) &&
      /^DEMO-GREEN-CUP-(2025|2026)$/.test(tournament.tournamentCode) &&
      (await prisma.match.count({
        where: { organizationId, tournamentId: tournament.id, reportVersion: { gt: 0 } },
      })) === 0
    if (legacyDemo)
      return {
        mode: 'DEMO' as const,
        official: null,
        rules: null,
        matchWhere: {
          organizationId,
          tournamentId: tournament.id,
          status: { not: 'DRAFT' },
        } satisfies Prisma.MatchWhereInput,
      }
    if (!this.resultsService)
      throw new ApiHttpException(HttpStatus.SERVICE_UNAVAILABLE, {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: '正式赛果服务尚未接入',
      })
    const publishedRule = await prisma.competitionRuleVersion.findFirst({
      where: { organizationId, tournamentId: tournament.id, status: 'PUBLISHED' },
      select: { id: true },
    })
    if (!publishedRule) {
      const [fixtures, registrations] = await Promise.all([
        prisma.match.count({ where: { organizationId, tournamentId: tournament.id } }),
        prisma.teamRegistration.count({ where: { organizationId, tournamentId: tournament.id } }),
      ])
      if (fixtures === 0 && registrations === 0)
        return {
          mode: 'PENDING' as const,
          official: null,
          rules: null,
          matchWhere: {
            organizationId,
            tournamentId: tournament.id,
            id: { in: [] },
          } satisfies Prisma.MatchWhereInput,
        }
    }
    const official = await this.resultsService.readTournamentResults(
      organizationId,
      tournament.id,
      prisma,
    )
    const rule = await prisma.competitionRuleVersion.findFirst({
      where: { id: official.ruleVersionId, organizationId, tournamentId: tournament.id },
    })
    if (!rule) throw notFound('确认赛果的规程版本不存在')
    return {
      mode: 'OFFICIAL' as const,
      official,
      rules: parseResultsRules(rule.id, rule.rules),
      matchWhere: {
        organizationId,
        tournamentId: tournament.id,
        id: {
          in: official.confirmedResults
            .filter((fact) => fact.status === 'CONFIRMED')
            .map((fact) => fact.id),
        },
        status: MatchStatus.FINISHED,
        confirmedReportVersion: { not: null },
      } satisfies Prisma.MatchWhereInput,
    }
  }
}

const matchSummaryInclude = {
  homeTeam: true,
  awayTeam: true,
  venue: true,
} as const

function postSummaryInclude(userId?: string, blocked: string[] = []) {
  return {
    ...postBaseInclude(userId, blocked),
    quotedPost: { include: postBaseInclude(userId, blocked) },
  } as const
}

function postBaseInclude(userId?: string, blocked: string[] = []) {
  return {
    author: { select: publicIdentitySelect },
    team: true,
    tags: { orderBy: { position: 'asc' } },
    _count: {
      select: {
        likes: true,
        comments: {
          where: { hiddenAt: null, ...(blocked.length ? { userId: { notIn: blocked } } : {}) },
        },
      },
    },
    likes: userId
      ? { where: { userId }, select: { id: true } }
      : { where: { userId: '00000000-0000-4000-8000-000000000000' }, select: { id: true } },
    favorites: {
      where: { userId: userId ?? '00000000-0000-4000-8000-000000000000' },
      select: { id: true },
    },
  } as const
}

function mapTeam(team: {
  id: string
  teamCode: string
  name: string
  shortName: string | null
  collegeName: string | null
  primaryColor: string | null
  secondaryColor: string | null
  crestUrl?: string | null
  coverUrl?: string | null
}) {
  return {
    id: team.id,
    teamCode: team.teamCode,
    name: team.name,
    shortName: team.shortName ?? team.name,
    collegeName: team.collegeName,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    crestUrl: team.crestUrl ?? null,
    // Stored 2.80:1 team background (captain upload); null → clients show the default.
    coverUrl: defaultCover('team', team.coverUrl),
  }
}

function mapMatch(match: {
  id: string
  tournamentId: string
  matchCode: string
  title: string
  status: MatchStatus
  confirmedReportVersion?: number | null
  scheduledStartAt: Date | null
  homeScore: number | null
  awayScore: number | null
  homePenaltyScore: number | null
  awayPenaltyScore: number | null
  statusReason: string | null
  homeTeam: Parameters<typeof mapTeam>[0] | null
  awayTeam: Parameters<typeof mapTeam>[0] | null
  venue: { id: string; name: string } | null
  stage?: { id: string; name: string; type: string } | null
  group?: { id: string; name: string } | null
  round?: { id: string; name: string; roundNumber: number } | null
}) {
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    matchCode: match.matchCode,
    title: match.title,
    status: match.status,
    scheduledStartAt: match.scheduledStartAt?.toISOString() ?? null,
    homeTeam: match.homeTeam ? mapTeam(match.homeTeam) : null,
    awayTeam: match.awayTeam ? mapTeam(match.awayTeam) : null,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    homePenaltyScore: match.homePenaltyScore,
    awayPenaltyScore: match.awayPenaltyScore,
    statusReason: match.statusReason,
    venue: match.venue ? { id: match.venue.id, name: match.venue.name } : null,
    stageName: match.stage?.name ?? null,
    stageType: match.stage?.type ?? null,
    groupName: match.group?.name ?? null,
    roundName: match.round?.name ?? null,
  }
}

function mapResultMatch(
  match: Parameters<typeof mapMatch>[0],
  official: Awaited<ReturnType<ResultsService['readTournamentResults']>> | null,
) {
  const mapped = mapMatch(match)
  if (!official) return mapped
  const fact = official.confirmedResults.find((item) => item.id === match.id)
  if (fact)
    return {
      ...mapped,
      homeScore: fact.status === 'VOID' ? null : fact.homeScore,
      awayScore: fact.status === 'VOID' ? null : fact.awayScore,
      homePenaltyScore: fact.status === 'VOID' ? null : fact.homePenaltyScore,
      awayPenaltyScore: fact.status === 'VOID' ? null : fact.awayPenaltyScore,
      resultStatus: fact.status,
      confirmedReportVersion: fact.revision,
    }
  const hasRecordedPreview =
    match.confirmedReportVersion !== null && match.confirmedReportVersion !== undefined
  return {
    ...mapped,
    ...(match.status === MatchStatus.FINISHED && !hasRecordedPreview
      ? { homeScore: null, awayScore: null, homePenaltyScore: null, awayPenaltyScore: null }
      : {}),
    resultStatus:
      hasRecordedPreview || match.status === MatchStatus.LIVE ? 'LIVE_PREVIEW' : 'UNCONFIRMED',
    confirmedReportVersion: null,
  }
}

function mapPost(
  post: {
    id: string
    tournamentId?: string | null
    tags?: Array<Pick<ResolvedPostTag, 'kind' | 'label' | 'teamId' | 'playerId'>>
    organizationId?: string
    type: PostType
    title: string | null
    body: string
    imageUrl: string | null
    publishedAt: Date
    updatedAt?: Date
    quotedPostId?: string | null
    quotedPost?: (Parameters<typeof mapPost>[0] & { status: PostStatus }) | null
    author: PublicIdentitySource | null
    team: Parameters<typeof mapTeam>[0] | null
    _count: { likes: number; comments: number }
    likes: Array<{ id: string }>
    favorites?: Array<{ id: string }>
  },
  viewerUserId?: string,
): MappedPost {
  return {
    id: post.id,
    ...(post.tournamentId ? { tournamentId: post.tournamentId } : {}),
    tags: mapPostTags(post.tags ?? []),
    type: post.type,
    title: post.title,
    body: post.body,
    imageUrl: post.imageUrl,
    imageUrls: postImageUrls(post.imageUrl),
    publishedAt: post.publishedAt.toISOString(),
    updatedAt: (post.updatedAt ?? post.publishedAt).toISOString(),
    quotedPostId: post.quotedPostId ?? null,
    quotedPost:
      post.quotedPost?.status === PostStatus.PUBLISHED
        ? mapPost(post.quotedPost, viewerUserId)
        : null,
    favoritedByMe: (post.favorites?.length ?? 0) > 0,
    author: post.author
      ? publicIdentity(post.author, post.organizationId, viewerUserId)
      : officialIdentity,
    team: post.team ? mapTeam(post.team) : null,
    likeCount: post._count.likes,
    commentCount: post._count.comments,
    likedByMe: post.likes.length > 0,
  }
}

function buildPlayerStats(
  events: Array<{
    type: MatchEventType
    playerId: string | null
    relatedPlayerId: string | null
    player: { id: string; displayName: string } | null
    relatedPlayer: { id: string; displayName: string } | null
    team: Parameters<typeof mapTeam>[0]
  }>,
  appearances: Array<{
    playerId: string
    minutesPlayed: number
    starter: boolean
    player?: { id: string; displayName: string }
    team?: Parameters<typeof mapTeam>[0]
  }>,
) {
  const rows = new Map<
    string,
    ReturnType<typeof emptyPlayerStats> & { team: ReturnType<typeof mapTeam> | null }
  >()
  const ensure = (id: string, name: string, team: ReturnType<typeof mapTeam> | null) => {
    const row = rows.get(id) ?? { ...emptyPlayerStats(id, name), team }
    if (!row.displayName && name) row.displayName = name
    if (!row.team && team) row.team = team
    rows.set(id, row)
    return row
  }

  for (const appearance of appearances) {
    if (appearance.minutesPlayed <= 0) continue
    const row = ensure(
      appearance.playerId,
      appearance.player?.displayName ?? '',
      appearance.team ? mapTeam(appearance.team) : null,
    )
    row.appearances += 1
    row.starts += appearance.starter ? 1 : 0
    row.minutes += appearance.minutesPlayed
  }
  for (const event of events) {
    const team = mapTeam(event.team)
    if (event.playerId && event.player) {
      const row = ensure(event.playerId, event.player.displayName, team)
      if (event.type === MatchEventType.GOAL) row.goals += 1
      if (event.type === MatchEventType.YELLOW_CARD) row.yellowCards += 1
      if (event.type === MatchEventType.RED_CARD) row.redCards += 1
    }
    if (event.type === MatchEventType.GOAL && event.relatedPlayerId && event.relatedPlayer) {
      ensure(event.relatedPlayerId, event.relatedPlayer.displayName, team).assists += 1
    }
  }
  return [...rows.values()].filter((row) => row.displayName)
}

function emptyPlayerStats(id: string, displayName: string) {
  return {
    id,
    displayName,
    appearances: 0,
    starts: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
  }
}

function calculateTeamRecord(
  teamId: string,
  matches: Array<{
    status: MatchStatus
    homeTeamId: string | null
    awayTeamId: string | null
    homeScore: number | null
    awayScore: number | null
  }>,
) {
  const result = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
  for (const match of matches) {
    if (
      (match.status !== MatchStatus.FINISHED && match.status !== MatchStatus.LIVE) ||
      match.homeScore === null ||
      match.awayScore === null
    ) {
      continue
    }
    const isHome = match.homeTeamId === teamId
    const goalsFor = isHome ? match.homeScore : match.awayScore
    const goalsAgainst = isHome ? match.awayScore : match.homeScore
    result.played += 1
    result.goalsFor += goalsFor
    result.goalsAgainst += goalsAgainst
    if (goalsFor > goalsAgainst) {
      result.won += 1
      result.points += 3
    } else if (goalsFor < goalsAgainst) {
      result.lost += 1
    } else {
      result.drawn += 1
      result.points += 1
    }
  }
  return { ...result, goalDifference: result.goalsFor - result.goalsAgainst }
}

function knockoutPlaceholder(matchCode: string, side: 'home' | 'away'): string {
  const placeholders: Record<string, [string, string]> = {
    'GC26-SF-01': ['A组第 1', 'B组第 2'],
    'GC26-SF-02': ['B组第 1', 'A组第 2'],
    'GC26-THIRD': ['半决赛 1 负者', '半决赛 2 负者'],
    'GC26-FINAL': ['半决赛 1 胜者', '半决赛 2 胜者'],
  }
  return placeholders[matchCode]?.[side === 'home' ? 0 : 1] ?? '待定'
}

function notFound(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.NOT_FOUND, {
    code: ERROR_CODES.NOT_FOUND,
    message,
  })
}

function conflict(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.CONFLICT, {
    code: ERROR_CODES.CONFLICT,
    message,
  })
}

export interface MappedPost {
  id: string
  tournamentId?: string
  tags: ReturnType<typeof mapPostTags>
  type: PostType
  title: string | null
  body: string
  imageUrl: string | null
  imageUrls: string[]
  publishedAt: string
  updatedAt: string
  author: ReturnType<typeof publicIdentity> | typeof officialIdentity
  team: ReturnType<typeof mapTeam> | null
  likeCount: number
  commentCount: number
  likedByMe: boolean
  favoritedByMe: boolean
  quotedPostId: string | null
  quotedPost: MappedPost | null
}

function commentInclude(userId?: string) {
  return {
    user: { select: publicIdentitySelect },
    _count: { select: { likes: true } },
    likes: {
      where: { userId: userId ?? '00000000-0000-4000-8000-000000000000' },
      select: { id: true },
    },
  } as const
}

function mapComment(
  comment: {
    id: string
    body: string
    imageUrl?: string | null
    parentCommentId: string | null
    createdAt: Date
    updatedAt: Date
    user: PublicIdentitySource
    _count: { likes: number }
    likes: Array<{ id: string }>
  },
  organizationId: string,
  viewerUserId?: string,
) {
  return {
    id: comment.id,
    body: comment.body,
    imageUrls: commentImageUrls(comment.id, comment.imageUrl ?? null),
    parentCommentId: comment.parentCommentId,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    author: publicIdentity(comment.user, organizationId, viewerUserId),
    likeCount: comment._count.likes,
    likedByMe: comment.likes.length > 0,
  }
}

function nextContentVersion(previous: Date) {
  return new Date(Math.max(Date.now(), previous.getTime() + 1))
}

async function contentAudit(
  tx: Prisma.TransactionClient,
  session: Awaited<ReturnType<AuthService['requireSession']>>,
  action: string,
  targetType: string,
  targetId: string,
  before: Prisma.InputJsonObject,
  after: Prisma.InputJsonObject,
  requestId: string,
) {
  await tx.auditLog.create({
    data: {
      organizationId: session.organizationId,
      actorType: AuditActorType.USER,
      actorUserId: session.userId,
      actorRoleSnapshot: session.user.roles.map(({ role, scopeType, scopeId }) => ({
        role,
        scopeType,
        scopeId,
      })),
      action,
      targetType,
      targetId,
      beforeSummary: before,
      afterSummary: after,
      requestId,
      source: 'API',
    },
  })
}

function forbidden(message: string) {
  return new ApiHttpException(HttpStatus.FORBIDDEN, { code: ERROR_CODES.FORBIDDEN, message })
}
