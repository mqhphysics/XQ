import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NotificationType,
  ReportStatus,
  ReportTargetType,
  TeamJoinApplicationStatus,
} from '../generated/prisma/client'
import { DEMO_ACCOUNTS, DEMO_PLAYERS, DEMO_POSTS, DEMO_TEAMS, fixtureId } from './demo-fixture'
import {
  DEMO_CONTENT_REPORTS,
  DEMO_DIRECT_CONVERSATION,
  DEMO_NOTIFICATION_COVERAGE,
  DEMO_PLAYER_FOLLOWS,
  DEMO_TEAM_APPLICATIONS,
  DEMO_TEAM_POST_INDEXES,
} from './seed-demo-social'

test('notification coverage includes likes, replies, applications, reports, and direct messages', () => {
  assert.deepEqual(
    new Set(DEMO_NOTIFICATION_COVERAGE),
    new Set([
      NotificationType.POST_LIKED,
      NotificationType.COMMENT_REPLIED,
      NotificationType.TEAM_APPLICATION,
      NotificationType.REPORT_CREATED,
      NotificationType.REPORT_UPDATED,
      NotificationType.DIRECT_MESSAGE,
    ]),
  )
})

test('team post and player follow definitions only reference stable demo facts', () => {
  const accountNames = new Set(DEMO_ACCOUNTS.map(({ username }) => username))
  const postKeys = new Set(DEMO_POSTS.map(({ key }) => key))
  const followKeys = new Set<string>()

  for (const [postKey, teamIndex] of Object.entries(DEMO_TEAM_POST_INDEXES)) {
    assert.ok(postKeys.has(postKey), `unknown demo post ${postKey}`)
    assert.ok(DEMO_TEAMS[teamIndex], `unknown team index ${teamIndex} for ${postKey}`)
  }
  for (const post of DEMO_POSTS.filter(({ type }) => type === 'COMMUNITY')) {
    assert.notEqual(
      DEMO_TEAM_POST_INDEXES[post.key],
      undefined,
      `${post.key} should be available as a team update`,
    )
  }

  for (const definition of DEMO_PLAYER_FOLLOWS) {
    assert.ok(accountNames.has(definition.username))
    assert.ok(definition.playerIndexes.length > 0)
    for (const playerIndex of definition.playerIndexes) {
      assert.ok(DEMO_PLAYERS[playerIndex], `unknown followed player index ${playerIndex}`)
      const followKey = `${definition.username}:${playerIndex}`
      assert.equal(followKeys.has(followKey), false, `duplicate player follow ${followKey}`)
      followKeys.add(followKey)
    }
  }
})

test('team applications include a consistent pending and reviewed example', () => {
  const applicationKeys = new Set<string>()
  assert.ok(
    DEMO_TEAM_APPLICATIONS.some(({ status }) => status === TeamJoinApplicationStatus.PENDING),
  )

  for (const application of DEMO_TEAM_APPLICATIONS) {
    assert.ok(DEMO_ACCOUNTS.some(({ username }) => username === application.username))
    assert.ok(DEMO_TEAMS[application.teamIndex])
    const uniqueKey = `${application.teamIndex}:${application.username}`
    assert.equal(applicationKeys.has(uniqueKey), false, `duplicate application ${uniqueKey}`)
    applicationKeys.add(uniqueKey)

    if (application.status === TeamJoinApplicationStatus.PENDING) {
      assert.equal(application.reviewedByUsername, null)
      assert.equal(application.reviewedAt, null)
      assert.equal(application.decisionNote, null)
    } else {
      assert.ok(application.reviewedByUsername)
      assert.ok(application.reviewedAt)
      assert.ok(Date.parse(application.reviewedAt) >= Date.parse(application.createdAt))
      assert.ok(application.decisionNote)
    }
  }
})

test('reports cover open feedback and a resolved content complaint with valid chronology', () => {
  const openFeedback = DEMO_CONTENT_REPORTS.find(
    ({ targetType, status }) =>
      targetType === ReportTargetType.FEEDBACK && status === ReportStatus.OPEN,
  )
  const resolvedComplaint = DEMO_CONTENT_REPORTS.find(
    ({ targetType, status }) =>
      targetType !== ReportTargetType.FEEDBACK && status === ReportStatus.RESOLVED,
  )
  assert.ok(openFeedback)
  assert.equal(openFeedback.targetId, null)
  assert.equal(openFeedback.handledByUsername, null)
  assert.equal(openFeedback.handledAt, null)
  assert.ok(resolvedComplaint)
  assert.equal(resolvedComplaint.targetId, fixtureId('comment:community-derby:reporter'))
  assert.ok(resolvedComplaint.handledByUsername)
  assert.ok(resolvedComplaint.handledAt)
  assert.ok(Date.parse(resolvedComplaint.handledAt) >= Date.parse(resolvedComplaint.createdAt))
  assert.ok(resolvedComplaint.resolution)
})

test('direct conversation is same-organization-ready and has a coherent message timeline', () => {
  const participantNames = new Set(DEMO_DIRECT_CONVERSATION.usernames)
  assert.equal(participantNames.size, 2)
  assert.ok(
    [...participantNames].every((username) =>
      DEMO_ACCOUNTS.some((account) => account.username === username),
    ),
  )
  assert.ok(DEMO_DIRECT_CONVERSATION.messages.length >= 2)
  assert.equal(
    new Set(DEMO_DIRECT_CONVERSATION.messages.map(({ clientMessageId }) => clientMessageId)).size,
    DEMO_DIRECT_CONVERSATION.messages.length,
  )

  let previousCreatedAt = Date.parse(DEMO_DIRECT_CONVERSATION.createdAt)
  for (const message of DEMO_DIRECT_CONVERSATION.messages) {
    assert.ok(participantNames.has(message.senderUsername))
    const createdAt = Date.parse(message.createdAt)
    assert.ok(createdAt >= previousCreatedAt)
    if (message.readAt) assert.ok(Date.parse(message.readAt) >= createdAt)
    previousCreatedAt = createdAt
  }
})
