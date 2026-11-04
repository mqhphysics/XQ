import { createHash } from 'node:crypto'

import {
  MembershipStatus,
  NotificationType,
  PlayerPosition,
  PostStatus,
  ReportStatus,
  ReportTargetType,
  RoleScopeType,
  TeamJoinApplicationStatus,
  TeamMembershipStatus,
  UserStatus,
} from '../generated/prisma/client'
import type { Prisma } from '../generated/prisma/client'
import { hashPassword } from '../auth/password'
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  DEMO_PLAYERS,
  DEMO_POSTS,
  DEMO_TEAMS,
  fixtureId,
  isPlatformDemoPost,
} from './demo-fixture'

export const DEMO_MATCH_REVIEWS = [
  {
    matchCode: 'GC26-SF-01',
    username: 'student',
    rating: 5,
    body: '淘汰赛强度一下就上来了，双方最后二十分钟都踢得很有内容。',
    createdAt: '2026-09-01T21:20:00+08:00',
  },
  {
    matchCode: 'GC26-SF-01',
    username: 'player',
    rating: 4,
    body: '攻防转换很快，一队对第二落点的控制是胜负关键。',
    createdAt: '2026-09-01T21:35:00+08:00',
  },
  {
    matchCode: 'GC26-SF-01',
    username: 'reporter',
    rating: 5,
    body: '现场节奏和看台氛围都很好，比赛事件已经完成复核。',
    createdAt: '2026-09-01T21:50:00+08:00',
  },
  {
    matchCode: 'GC26-A-R1-01',
    username: 'captain',
    rating: 4,
    body: '德比踢得很艰苦，感谢两边同学在赛后互相致意。',
    createdAt: '2026-08-24T20:30:00+08:00',
  },
] as const

export const DEMO_TEAM_POST_INDEXES: Readonly<Record<string, number>> = {
  'community-derby': 0,
  'community-training': 0,
  'community-reporter': 0,
  'community-player': 0,
  'photo-community-huddle': 0,
  'photo-community-lineup': 0,
  'photo-community-celebration': 0,
  'community-night-album': 0,
  'community-wide-crop': 2,
  'community-tall-crop': 1,
  'community-day-album': 0,
  'community-short-note': 4,
  'community-long-note': 7,
  'community-banner-crop': 11,
}

export const DEMO_PLAYER_FOLLOWS = [
  { username: 'student', playerIndexes: [6, 10, 38] },
  { username: 'player', playerIndexes: [34, 70] },
  { username: 'captain', playerIndexes: [10, 38] },
  { username: 'reporter', playerIndexes: [6, 108] },
  { username: 'admin', playerIndexes: [6, 10] },
] as const

export const DEMO_TEAM_APPLICATIONS = [
  {
    key: 'student-pending-physics-one',
    username: 'student',
    teamIndex: 0,
    requestedPosition: PlayerPosition.FORWARD,
    message: '希望参加球队训练，也愿意先从替补和后勤协助做起。',
    status: TeamJoinApplicationStatus.PENDING,
    createdAt: '2026-09-01T23:00:00+08:00',
    reviewedByUsername: null,
    reviewedAt: null,
    decisionNote: null,
  },
  {
    key: 'reporter-rejected-physics-one',
    username: 'reporter',
    teamIndex: 0,
    requestedPosition: PlayerPosition.MIDFIELDER,
    message: '演示一条已经处理的历史申请。',
    status: TeamJoinApplicationStatus.REJECTED,
    createdAt: '2026-08-31T20:10:00+08:00',
    reviewedByUsername: 'captain',
    reviewedAt: '2026-08-31T20:40:00+08:00',
    decisionNote: '本轮锁定名单已满，欢迎下学期再申请。',
  },
] as const

export const DEMO_CONTENT_REPORTS = [
  {
    key: 'resolved-comment-report',
    reporterUsername: 'player',
    targetType: ReportTargetType.COMMENT,
    targetId: fixtureId('comment:community-derby:reporter'),
    reason: '演示投诉：语气可能引发误解',
    details: '这是一条用于验收管理员处理流程的虚构投诉，不代表真实违规。',
    status: ReportStatus.RESOLVED,
    handledByUsername: 'admin',
    resolution: '已复核上下文，内容无需删除，并向提交者说明处理结果。',
    actionTaken: 'NO_CONTENT_CHANGE',
    createdAt: '2026-08-25T09:00:00+08:00',
    handledAt: '2026-08-25T09:25:00+08:00',
  },
  {
    key: 'open-product-feedback',
    reporterUsername: 'student',
    targetType: ReportTargetType.FEEDBACK,
    targetId: null,
    reason: '私信抽屉体验建议',
    details: '希望从动态作者发起私信时继续停留在当前页面，并在右侧抽屉完成交流。',
    status: ReportStatus.OPEN,
    handledByUsername: null,
    resolution: null,
    actionTaken: null,
    createdAt: '2026-09-01T23:30:00+08:00',
    handledAt: null,
  },
] as const

export const DEMO_DIRECT_CONVERSATION = {
  key: 'student-captain',
  usernames: ['student', 'captain'],
  createdAt: '2026-09-01T22:45:00+08:00',
  messages: [
    {
      key: 'ask-training-time',
      senderUsername: 'student',
      clientMessageId: 'DEMO_FIXTURE-student-ask-training-time',
      body: '你好，下一次公开训练大概是什么时候？',
      createdAt: '2026-09-01T22:45:00+08:00',
      readAt: '2026-09-01T22:47:00+08:00',
    },
    {
      key: 'captain-training-reply',
      senderUsername: 'captain',
      clientMessageId: 'DEMO_FIXTURE-captain-training-reply',
      body: '周四傍晚会有恢复训练，确定开放后我会在球队动态里通知。',
      createdAt: '2026-09-01T22:48:00+08:00',
      readAt: '2026-09-01T22:50:00+08:00',
    },
    {
      key: 'student-thanks',
      senderUsername: 'student',
      clientMessageId: 'DEMO_FIXTURE-student-thanks',
      body: '收到，谢谢！我会留意球队动态。',
      createdAt: '2026-09-01T22:51:00+08:00',
      readAt: null,
    },
  ],
} as const

export const DEMO_NOTIFICATION_COVERAGE = [
  NotificationType.POST_LIKED,
  NotificationType.COMMENT_REPLIED,
  NotificationType.TEAM_APPLICATION,
  NotificationType.REPORT_CREATED,
  NotificationType.REPORT_UPDATED,
  NotificationType.DIRECT_MESSAGE,
] as const

export async function seedDemoAccountsAndCommunity(
  tx: Prisma.TransactionClient,
  organizationId: string,
  tournamentId: string,
  teams: Array<{ id: string }>,
): Promise<void> {
  if (teams.length !== DEMO_TEAMS.length) {
    throw new Error(
      `Demo social seed expected ${DEMO_TEAMS.length} teams, received ${teams.length}`,
    )
  }
  const usersByUsername = new Map<string, string>()

  for (const account of DEMO_ACCOUNTS) {
    const userId = fixtureId(`user:${account.username}`)
    const linkedPlayer =
      account.linkedTeamIndex === undefined || account.linkedPlayerIndex === undefined
        ? undefined
        : DEMO_PLAYERS[account.linkedTeamIndex * 14 + account.linkedPlayerIndex]

    await tx.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        loginNameNormalized: account.username,
        displayName: account.displayName,
        realName: account.realName,
        realNameNormalized: account.realName.trim().toLowerCase(),
        studentId: account.studentId,
        email: account.email,
        emailNormalized: account.email.toLowerCase(),
        bio: account.bio,
        avatarUrl: account.avatarUrl,
        verificationLevel: account.verificationLevel,
        playerProfileId: linkedPlayer?.id ?? null,
        status: UserStatus.ACTIVE,
      },
      update: {
        loginNameNormalized: account.username,
        displayName: account.displayName,
        realName: account.realName,
        realNameNormalized: account.realName.trim().toLowerCase(),
        studentId: account.studentId,
        email: account.email,
        emailNormalized: account.email.toLowerCase(),
        bio: account.bio,
        verificationLevel: account.verificationLevel,
        playerProfileId: linkedPlayer?.id ?? null,
        status: UserStatus.ACTIVE,
      },
    })
    await tx.user.updateMany({
      where: { id: userId, avatarUrl: null },
      data: { avatarUrl: account.avatarUrl },
    })

    const salt = createHash('sha256')
      .update(`xiaoqiu-demo:${account.username}`)
      .digest('hex')
      .slice(0, 32)
    const password = hashPassword(DEMO_PASSWORD, salt)
    await tx.passwordCredential.upsert({
      where: { userId },
      create: {
        id: fixtureId(`credential:${account.username}`),
        userId,
        passwordHash: password.hash,
        passwordSalt: password.salt,
        algorithm: password.algorithm,
      },
      update: {
        passwordHash: password.hash,
        passwordSalt: password.salt,
        algorithm: password.algorithm,
      },
    })

    await tx.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      create: {
        id: fixtureId(`membership:${account.username}`),
        organizationId,
        userId,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date('2026-08-20T08:00:00+08:00'),
      },
      update: { status: MembershipStatus.ACTIVE },
    })

    await tx.roleAssignment.deleteMany({ where: { userId } })
    for (const [roleIndex, assignment] of account.roles.entries()) {
      const scopeType =
        assignment.scope === 'TEAM'
          ? RoleScopeType.TEAM
          : assignment.scope === 'TOURNAMENT'
            ? RoleScopeType.TOURNAMENT
            : RoleScopeType.ORGANIZATION
      const scopeId =
        assignment.scope === 'TEAM'
          ? teams[account.linkedTeamIndex ?? account.primaryTeamIndex]!.id
          : assignment.scope === 'TOURNAMENT'
            ? tournamentId
            : organizationId
      await tx.roleAssignment.create({
        data: {
          id: fixtureId(`role:${account.username}:${roleIndex}`),
          organizationId,
          userId,
          role: assignment.role,
          scopeType,
          scopeId,
          grantedByUserId: userId,
        },
      })
    }

    await tx.userTeamPreference.deleteMany({ where: { userId } })
    await tx.userTeamPreference.create({
      data: {
        id: fixtureId(`preference:${account.username}:primary`),
        organizationId,
        userId,
        teamId: teams[account.primaryTeamIndex]!.id,
        isPrimary: true,
      },
    })
    for (const teamIndex of account.followedTeamIndexes) {
      if (teamIndex === account.primaryTeamIndex) continue
      await tx.userTeamPreference.create({
        data: {
          id: fixtureId(`preference:${account.username}:${teamIndex}`),
          organizationId,
          userId,
          teamId: teams[teamIndex]!.id,
          isPrimary: false,
        },
      })
    }

    usersByUsername.set(account.username, userId)
  }

  await seedDemoTeamMemberships(tx, organizationId, tournamentId, teams, usersByUsername)
  await seedDemoPlayerFollows(tx, organizationId, usersByUsername)
  await seedDemoTeamApplications(tx, organizationId, teams, usersByUsername)

  const postIds = DEMO_POSTS.map((post) => fixtureId(`post:${post.key}`))
  await tx.post.deleteMany({ where: { id: { in: postIds } } })

  for (const [postIndex, post] of DEMO_POSTS.entries()) {
    const postId = fixtureId(`post:${post.key}`)
    const teamIndex = DEMO_TEAM_POST_INDEXES[post.key]
    const authorUserId = post.authorUsername
      ? usersByUsername.get(post.authorUsername)
      : usersByUsername.get('admin')
    await tx.post.create({
      data: {
        id: postId,
        organizationId,
        tournamentId: isPlatformDemoPost(post) ? null : tournamentId,
        authorUserId: authorUserId ?? null,
        teamId: isPlatformDemoPost(post) || teamIndex === undefined ? null : teams[teamIndex]!.id,
        type: post.type,
        status: PostStatus.PUBLISHED,
        title: post.title ?? null,
        body: post.body,
        imageUrl: post.imageUrl ?? null,
        publishedAt: new Date(post.publishedAt),
        createdAt: new Date(post.publishedAt),
      },
    })
    if (post.quiet) continue

    const likerUsernames = DEMO_ACCOUNTS.slice(0, Math.min(5, postIndex + 2)).map(
      (account) => account.username,
    )
    await tx.postLike.createMany({
      data: likerUsernames.map((username, likerIndex) => ({
        id: fixtureId(`like:${post.key}:${username}`),
        organizationId,
        postId,
        userId: usersByUsername.get(username)!,
        createdAt: new Date(
          new Date(post.publishedAt).getTime() + (5 + likerIndex * 2) * 60 * 1000,
        ),
      })),
    })

    const commenter =
      post.key === 'community-derby'
        ? 'reporter'
        : DEMO_ACCOUNTS[(postIndex + 1) % DEMO_ACCOUNTS.length]!.username
    await tx.postComment.create({
      data: {
        id: fixtureId(`comment:${post.key}:${commenter}`),
        organizationId,
        postId,
        userId: usersByUsername.get(commenter)!,
        body: isPlatformDemoPost(post)
          ? '已看到，这条是平台通知。'
          : post.type === 'OFFICIAL'
            ? '收到，赛程和数据页都已经同步更新。'
            : '现场确实很有气氛，下一场继续加油！',
        createdAt: new Date(new Date(post.publishedAt).getTime() + 45 * 60 * 1000),
      },
    })
  }

  await tx.postComment.create({
    data: {
      id: fixtureId('comment-reply:community-derby:student-to-reporter'),
      organizationId,
      postId: fixtureId('post:community-derby'),
      userId: requireUserId(usersByUsername, 'student'),
      parentCommentId: fixtureId('comment:community-derby:reporter'),
      body: '谢谢支持！之后有新的现场照片也会继续分享。',
      createdAt: new Date('2026-08-24T21:00:00+08:00'),
    },
  })

  const reviewMatches = await tx.match.findMany({
    where: {
      organizationId,
      tournamentId,
      matchCode: { in: [...new Set(DEMO_MATCH_REVIEWS.map((review) => review.matchCode))] },
    },
    select: { id: true, matchCode: true },
  })
  const matchesByCode = new Map(reviewMatches.map((match) => [match.matchCode, match.id]))

  for (const review of DEMO_MATCH_REVIEWS) {
    const matchId = matchesByCode.get(review.matchCode)
    const userId = usersByUsername.get(review.username)
    if (!matchId || !userId) continue
    await tx.matchReview.upsert({
      where: { matchId_userId: { matchId, userId } },
      create: {
        id: fixtureId(`match-review:${review.matchCode}:${review.username}`),
        organizationId,
        matchId,
        userId,
        rating: review.rating,
        body: review.body,
        createdAt: new Date(review.createdAt),
      },
      update: {
        rating: review.rating,
        body: review.body,
        createdAt: new Date(review.createdAt),
      },
    })
  }

  await seedDemoReports(tx, organizationId, usersByUsername)
  const conversationId = await seedDemoDirectConversation(tx, organizationId, usersByUsername)
  await seedDemoNotifications(tx, organizationId, teams, usersByUsername, conversationId)
}

async function seedDemoTeamMemberships(
  tx: Prisma.TransactionClient,
  organizationId: string,
  tournamentId: string,
  teams: Array<{ id: string }>,
  usersByUsername: Map<string, string>,
): Promise<void> {
  const linkedUserByPlayerId = new Map<string, string>()
  for (const account of DEMO_ACCOUNTS) {
    if (account.linkedTeamIndex === undefined || account.linkedPlayerIndex === undefined) continue
    const player = DEMO_PLAYERS[account.linkedTeamIndex * 14 + account.linkedPlayerIndex]
    if (!player) throw new Error(`Linked demo player is missing for ${account.username}`)
    linkedUserByPlayerId.set(player.id, requireUserId(usersByUsername, account.username))
  }

  const lockedSnapshots = await tx.rosterSnapshot.findMany({
    where: { organizationId, tournamentId, lockedAt: { not: null } },
    select: {
      teamId: true,
      snapshotVersion: true,
      entries: {
        orderBy: { sortOrder: 'asc' },
        select: {
          playerProfileId: true,
          playerProfile: { select: { sourceKey: true, position: true } },
        },
      },
    },
    orderBy: { snapshotVersion: 'desc' },
  })
  const latestSnapshotByTeam = new Map<string, (typeof lockedSnapshots)[number]>()
  for (const snapshot of lockedSnapshots) {
    if (!latestSnapshotByTeam.has(snapshot.teamId)) {
      latestSnapshotByTeam.set(snapshot.teamId, snapshot)
    }
  }
  const lockedPlayers = teams.flatMap(({ id: teamId }) => {
    const snapshot = latestSnapshotByTeam.get(teamId)
    if (!snapshot) throw new Error(`Demo team ${teamId} has no locked roster snapshot`)
    return snapshot.entries.map((entry) => ({ ...entry, teamId }))
  })
  if (lockedPlayers.length !== DEMO_PLAYERS.length) {
    throw new Error(
      `Demo social seed expected ${DEMO_PLAYERS.length} locked players, received ${lockedPlayers.length}`,
    )
  }
  if (
    new Set(lockedPlayers.map(({ playerProfileId }) => playerProfileId)).size !==
    lockedPlayers.length
  ) {
    throw new Error('Demo locked rosters contain a duplicate player')
  }

  const demoUserIds = [...usersByUsername.values()]
  const demoTeamIds = teams.map(({ id }) => id)
  await tx.teamMembership.deleteMany({
    where: {
      organizationId,
      OR: [
        { playerProfileId: { in: lockedPlayers.map(({ playerProfileId }) => playerProfileId) } },
        { teamId: { in: demoTeamIds }, userId: { in: demoUserIds } },
      ],
    },
  })

  const joinedBase = Date.parse('2026-08-18T08:00:00+08:00')
  await tx.teamMembership.createMany({
    data: lockedPlayers.map((player, playerIndex) => ({
      id: fixtureId(`team-membership:${player.playerProfile.sourceKey ?? player.playerProfileId}`),
      organizationId,
      teamId: player.teamId,
      userId: linkedUserByPlayerId.get(player.playerProfileId) ?? null,
      playerProfileId: player.playerProfileId,
      position: player.playerProfile.position,
      status: TeamMembershipStatus.ACTIVE,
      joinedAt: new Date(joinedBase + playerIndex * 60_000),
      createdAt: new Date(joinedBase + playerIndex * 60_000),
      updatedAt: new Date(joinedBase + playerIndex * 60_000),
    })),
  })
}

async function seedDemoPlayerFollows(
  tx: Prisma.TransactionClient,
  organizationId: string,
  usersByUsername: Map<string, string>,
): Promise<void> {
  await tx.userPlayerFollow.deleteMany({
    where: { organizationId, userId: { in: [...usersByUsername.values()] } },
  })
  const followedBase = Date.parse('2026-08-21T10:00:00+08:00')
  const follows = DEMO_PLAYER_FOLLOWS.flatMap((definition, definitionIndex) =>
    definition.playerIndexes.map((playerIndex, followedIndex) => {
      const player = DEMO_PLAYERS[playerIndex]
      if (!player) throw new Error(`Demo follow references missing player index ${playerIndex}`)
      const createdAt = new Date(followedBase + (definitionIndex * 10 + followedIndex) * 60_000)
      return {
        id: fixtureId(`player-follow:${definition.username}:${player.sourceKey}`),
        organizationId,
        userId: requireUserId(usersByUsername, definition.username),
        playerProfileId: player.id,
        createdAt,
      }
    }),
  )
  await tx.userPlayerFollow.createMany({ data: follows })
}

async function seedDemoTeamApplications(
  tx: Prisma.TransactionClient,
  organizationId: string,
  teams: Array<{ id: string }>,
  usersByUsername: Map<string, string>,
): Promise<void> {
  await tx.teamJoinApplication.deleteMany({
    where: {
      organizationId,
      teamId: { in: teams.map(({ id }) => id) },
      userId: { in: [...usersByUsername.values()] },
    },
  })
  await tx.teamJoinApplication.createMany({
    data: DEMO_TEAM_APPLICATIONS.map((application) => {
      const account = DEMO_ACCOUNTS.find(({ username }) => username === application.username)
      const linkedPlayer =
        account?.linkedTeamIndex === undefined || account.linkedPlayerIndex === undefined
          ? undefined
          : DEMO_PLAYERS[account.linkedTeamIndex * 14 + account.linkedPlayerIndex]
      const createdAt = new Date(application.createdAt)
      const reviewedAt = application.reviewedAt ? new Date(application.reviewedAt) : null
      return {
        id: fixtureId(`team-application:${application.key}`),
        organizationId,
        teamId: teams[application.teamIndex]!.id,
        userId: requireUserId(usersByUsername, application.username),
        playerProfileId: linkedPlayer?.id ?? null,
        requestedPosition: application.requestedPosition,
        message: application.message,
        status: application.status,
        reviewedByUserId: application.reviewedByUsername
          ? requireUserId(usersByUsername, application.reviewedByUsername)
          : null,
        reviewedAt,
        decisionNote: application.decisionNote,
        createdAt,
        updatedAt: reviewedAt ?? createdAt,
      }
    }),
  })
}

async function seedDemoReports(
  tx: Prisma.TransactionClient,
  organizationId: string,
  usersByUsername: Map<string, string>,
): Promise<void> {
  await tx.contentReport.deleteMany({
    where: { organizationId, reporterUserId: { in: [...usersByUsername.values()] } },
  })
  await tx.contentReport.createMany({
    data: DEMO_CONTENT_REPORTS.map((report) => {
      const createdAt = new Date(report.createdAt)
      const handledAt = report.handledAt ? new Date(report.handledAt) : null
      return {
        id: fixtureId(`content-report:${report.key}`),
        organizationId,
        reporterUserId: requireUserId(usersByUsername, report.reporterUsername),
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        details: report.details,
        status: report.status,
        handledByUserId: report.handledByUsername
          ? requireUserId(usersByUsername, report.handledByUsername)
          : null,
        resolution: report.resolution,
        actionTaken: report.actionTaken,
        handledAt,
        createdAt,
        updatedAt: handledAt ?? createdAt,
      }
    }),
  })
}

async function seedDemoDirectConversation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  usersByUsername: Map<string, string>,
): Promise<string> {
  const firstUserId = requireUserId(usersByUsername, DEMO_DIRECT_CONVERSATION.usernames[0])
  const secondUserId = requireUserId(usersByUsername, DEMO_DIRECT_CONVERSATION.usernames[1])
  const [userOneId, userTwoId] =
    firstUserId < secondUserId ? [firstUserId, secondUserId] : [secondUserId, firstUserId]
  const lastMessageAt = new Date(
    DEMO_DIRECT_CONVERSATION.messages[DEMO_DIRECT_CONVERSATION.messages.length - 1]!.createdAt,
  )
  const conversation = await tx.directConversation.upsert({
    where: { organizationId_userOneId_userTwoId: { organizationId, userOneId, userTwoId } },
    create: {
      id: fixtureId(`direct-conversation:${DEMO_DIRECT_CONVERSATION.key}`),
      organizationId,
      userOneId,
      userTwoId,
      lastMessageAt,
      createdAt: new Date(DEMO_DIRECT_CONVERSATION.createdAt),
    },
    update: {
      lastMessageAt,
      createdAt: new Date(DEMO_DIRECT_CONVERSATION.createdAt),
    },
  })
  await tx.directMessage.deleteMany({ where: { conversationId: conversation.id } })
  await tx.directMessage.createMany({
    data: DEMO_DIRECT_CONVERSATION.messages.map((message) => ({
      id: fixtureId(`direct-message:${DEMO_DIRECT_CONVERSATION.key}:${message.key}`),
      organizationId,
      conversationId: conversation.id,
      senderUserId: requireUserId(usersByUsername, message.senderUsername),
      clientMessageId: message.clientMessageId,
      body: message.body,
      readAt: message.readAt ? new Date(message.readAt) : null,
      createdAt: new Date(message.createdAt),
    })),
  })
  return conversation.id
}

async function seedDemoNotifications(
  tx: Prisma.TransactionClient,
  organizationId: string,
  teams: Array<{ id: string }>,
  usersByUsername: Map<string, string>,
  conversationId: string,
): Promise<void> {
  const studentId = requireUserId(usersByUsername, 'student')
  const playerId = requireUserId(usersByUsername, 'player')
  const captainId = requireUserId(usersByUsername, 'captain')
  const reporterId = requireUserId(usersByUsername, 'reporter')
  const adminId = requireUserId(usersByUsername, 'admin')
  const trainingPostId = fixtureId('post:community-training')
  const derbyPostId = fixtureId('post:community-derby')
  const derbyCommentId = fixtureId('comment:community-derby:reporter')
  const derbyReplyId = fixtureId('comment-reply:community-derby:student-to-reporter')
  const pendingApplicationId = fixtureId('team-application:student-pending-physics-one')
  const rejectedApplicationId = fixtureId('team-application:reporter-rejected-physics-one')
  const resolvedReportId = fixtureId('content-report:resolved-comment-report')
  const openFeedbackId = fixtureId('content-report:open-product-feedback')
  const directMessageId = fixtureId('direct-message:student-captain:student-thanks')
  const teamId = teams[0]!.id

  await tx.userNotification.deleteMany({
    where: { organizationId, recipientUserId: { in: [...usersByUsername.values()] } },
  })
  const notifications = [
    {
      id: fixtureId('notification:post-like:training:student'),
      organizationId,
      recipientUserId: captainId,
      actorUserId: studentId,
      type: NotificationType.POST_LIKED,
      title: '动态收到新的点赞',
      body: '知夏看球点赞了你的动态',
      linkPath: `/pages/post-detail/index?postId=${trainingPostId}`,
      deduplicationKey: `post-like:${trainingPostId}:${studentId}`,
      createdAt: new Date('2026-08-30T21:20:00+08:00'),
    },
    {
      id: fixtureId('notification:post-comment:derby:reporter'),
      organizationId,
      recipientUserId: studentId,
      actorUserId: reporterId,
      type: NotificationType.POST_COMMENTED,
      title: '你的动态收到新评论',
      body: '现场确实很有气氛，下一场继续加油！',
      linkPath: `/pages/post-detail/index?postId=${derbyPostId}`,
      deduplicationKey: `post-comment:${derbyCommentId}`,
      readAt: new Date('2026-08-25T08:00:00+08:00'),
      createdAt: new Date('2026-08-24T20:55:00+08:00'),
    },
    {
      id: fixtureId('notification:comment-reply:derby:student'),
      organizationId,
      recipientUserId: reporterId,
      actorUserId: studentId,
      type: NotificationType.COMMENT_REPLIED,
      title: '有人回复了你的评论',
      body: '谢谢支持！之后有新的现场照片也会继续分享。',
      linkPath: `/pages/post-detail/index?postId=${derbyPostId}`,
      deduplicationKey: `post-comment:${derbyReplyId}`,
      createdAt: new Date('2026-08-24T21:00:00+08:00'),
    },
    {
      id: fixtureId('notification:team-application:student-pending'),
      organizationId,
      recipientUserId: captainId,
      actorUserId: studentId,
      type: NotificationType.TEAM_APPLICATION,
      title: '新的入队申请',
      body: '知夏看球申请加入物院一队',
      linkPath: `/pages/my-team/index?teamId=${teamId}`,
      deduplicationKey: `team-application:${pendingApplicationId}`,
      createdAt: new Date('2026-09-01T23:00:00+08:00'),
    },
    {
      id: fixtureId('notification:team-application:reporter-rejected'),
      organizationId,
      recipientUserId: reporterId,
      actorUserId: captainId,
      type: NotificationType.TEAM_APPLICATION_DECIDED,
      title: '入队申请未通过',
      body: '本轮锁定名单已满，欢迎下学期再申请。',
      linkPath: `/pages/readonly-team-detail/index?teamId=${teamId}`,
      deduplicationKey: `team-application-decision:${rejectedApplicationId}:REJECTED`,
      readAt: new Date('2026-08-31T21:00:00+08:00'),
      createdAt: new Date('2026-08-31T20:40:00+08:00'),
    },
    {
      id: fixtureId('notification:report-created:resolved-comment'),
      organizationId,
      recipientUserId: adminId,
      actorUserId: playerId,
      type: NotificationType.REPORT_CREATED,
      title: '收到新的投诉或反馈',
      body: '内容投诉：演示投诉：语气可能引发误解',
      linkPath: '/pages/me/index?panel=reports',
      deduplicationKey: `report-created:${resolvedReportId}`,
      readAt: new Date('2026-08-25T09:10:00+08:00'),
      createdAt: new Date('2026-08-25T09:00:00+08:00'),
    },
    {
      id: fixtureId('notification:report-updated:resolved-comment'),
      organizationId,
      recipientUserId: playerId,
      actorUserId: adminId,
      type: NotificationType.REPORT_UPDATED,
      title: '你的投诉或反馈已有处理结果',
      body: '已复核上下文，内容无需删除，并向提交者说明处理结果。',
      linkPath: '/pages/me/index',
      deduplicationKey: `report-updated:${resolvedReportId}:RESOLVED`,
      readAt: new Date('2026-08-25T10:00:00+08:00'),
      createdAt: new Date('2026-08-25T09:25:00+08:00'),
    },
    {
      id: fixtureId('notification:report-created:open-feedback'),
      organizationId,
      recipientUserId: adminId,
      actorUserId: studentId,
      type: NotificationType.REPORT_CREATED,
      title: '收到新的投诉或反馈',
      body: '问题反馈：私信抽屉体验建议',
      linkPath: '/pages/me/index?panel=reports',
      deduplicationKey: `report-created:${openFeedbackId}`,
      createdAt: new Date('2026-09-01T23:30:00+08:00'),
    },
    {
      id: fixtureId('notification:direct-message:student-thanks'),
      organizationId,
      recipientUserId: captainId,
      actorUserId: studentId,
      type: NotificationType.DIRECT_MESSAGE,
      title: '知夏看球发来私信',
      body: '收到，谢谢！我会留意球队动态。',
      linkPath: `/pages/me/index?conversationId=${conversationId}`,
      metadata: { conversationId },
      deduplicationKey: `direct-message:${directMessageId}`,
      createdAt: new Date('2026-09-01T22:51:00+08:00'),
    },
  ]
  const notificationTypes = new Set(notifications.map(({ type }) => type))
  for (const requiredType of DEMO_NOTIFICATION_COVERAGE) {
    if (!notificationTypes.has(requiredType)) {
      throw new Error(`Demo social seed is missing notification type ${requiredType}`)
    }
  }
  await tx.userNotification.createMany({ data: notifications })
}

function requireUserId(usersByUsername: Map<string, string>, username: string): string {
  const userId = usersByUsername.get(username)
  if (!userId) throw new Error(`Demo social seed is missing user ${username}`)
  return userId
}
