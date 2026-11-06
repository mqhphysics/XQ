import type { Prisma } from '../generated/prisma/client'

/** Public profile edits enter the existing administrator queue with the exact submitted text. */
export async function queueProfileReview(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  profile: { displayName: string; bio: string | null },
) {
  const report = await tx.contentReport.create({
    data: {
      organizationId,
      reporterUserId: userId,
      targetType: 'USER',
      targetId: userId,
      reason: '公开资料修改核查',
      details: JSON.stringify(profile).slice(0, 1000),
    },
  })
  const recipients = await tx.roleAssignment.findMany({
    where: {
      revokedAt: null,
      grantedAt: { lte: new Date() },
      user: { status: 'ACTIVE', memberships: { some: { organizationId, status: 'ACTIVE' } } },
      OR: [
        { role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' },
        {
          role: 'ORGANIZATION_ADMIN',
          organizationId,
          scopeType: 'ORGANIZATION',
          scopeId: organizationId,
        },
      ],
    },
    select: { userId: true },
    distinct: ['userId'],
  })
  if (recipients.length)
    await tx.userNotification.createMany({
      data: recipients.map(({ userId: recipientUserId }) => ({
        organizationId,
        recipientUserId,
        actorUserId: userId,
        type: 'REPORT_CREATED' as const,
        title: '公开资料待核查',
        body: '用户更新了昵称或简介，请在管理中心反馈与举报中核查当前资料。',
        linkPath: '/pages/me/index?panel=adminReports',
        deduplicationKey: 'profile-review:' + report.id,
      })),
      skipDuplicates: true,
    })
}
