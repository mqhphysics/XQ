import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { ApiHttpException } from './api-http.exception'
import type { Prisma } from '../generated/prisma/client'

/** Approval-only: reuse the applicant's student identity, never a matching name. */
export async function ensureStudentPlayer(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  actorUserId: string,
  requestId: string,
  bind = true,
) {
  const conflict = (message: string): never => {
    throw new ApiHttpException(HttpStatus.CONFLICT, { code: ERROR_CODES.CONFLICT, message })
  }
  await tx.$queryRawUnsafe('SELECT id FROM app_users WHERE id=$1::uuid FOR UPDATE', userId)
  const user = await tx.user.findFirst({
    where: {
      id: userId,
      status: 'ACTIVE',
      memberships: { some: { organizationId, status: 'ACTIVE' } },
    },
  })
  if (!user) return conflict('申请账号或组织身份已失效')
  let player = user.playerProfileId
    ? await tx.playerProfile.findFirst({ where: { id: user.playerProfileId, organizationId } })
    : null
  if (user.playerProfileId && !player) return conflict('账号球员关联不属于当前组织')
  if (!player) {
    const student = user.studentRecordId
      ? await tx.studentRecord.findFirst({
          where: { id: user.studentRecordId, organizationId, status: 'ACTIVE' },
        })
      : null
    if (!student) return conflict('请先确认本人的学生档案，再批准成为球员')
    player = await tx.playerProfile.upsert({
      where: { studentRecordId: student.id },
      create: {
        organizationId,
        studentRecordId: student.id,
        displayName: student.realName,
        studentId: student.studentNumber,
        academicYear: student.academicYear,
        avatarUrl: null,
        sourceType: 'APPROVED_STUDENT_APPLICATION',
        sourceKey: userId,
      },
      update: {},
    })
  }
  if (
    player.organizationId !== organizationId ||
    (player.studentRecordId &&
      user.studentRecordId &&
      player.studentRecordId !== user.studentRecordId)
  )
    return conflict('球员档案与申请人的学生身份不一致')
  if (
    await tx.user.findFirst({
      where: { playerProfileId: player.id, id: { not: userId } },
      select: { id: true },
    })
  )
    return conflict('该学生的球员档案已关联其他账号，不能覆盖')
  if (bind)
    await tx.user.update({
      where: { id: userId },
      data: {
        playerProfileId: player.id,
        ...(user.verificationLevel === 'STAFF_VERIFIED'
          ? {}
          : { verificationLevel: 'PLAYER_CONFIRMED' }),
      },
    })
  await tx.auditLog.create({
    data: {
      organizationId,
      actorType: 'USER',
      actorUserId,
      action: bind
        ? 'STUDENT_PLAYER_ASSOCIATED_ON_APPROVAL'
        : 'STUDENT_PLAYER_PREPARED_ON_APPROVAL',
      targetType: 'User',
      targetId: userId,
      afterSummary: { playerProfileId: player.id, studentRecordId: player.studentRecordId },
      reason: '通过球员申请或入队审批，按本人的稳定学生档案建立球员身份',
      requestId,
      source: 'API',
    },
  })
  return player
}
