import type { Prisma } from '../generated/prisma/client'
import { centerError } from '../admin-center/admin-center.policy'

export const STUDENT_REGISTRATION_KIND = 'STUDENT_REGISTRATION'
export function submittedStudentNumber(message: string): string {
  try {
    const value = JSON.parse(message).studentNumber
    return typeof value === 'string' && /^20\d{8}$/.test(value) ? value : ''
  } catch {
    return ''
  }
}
export async function notifyRegistrationAdmins(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  applicationId: string,
  realName: string,
  version = 1,
) {
  const roles = await tx.roleAssignment.findMany({
    where: {
      revokedAt: null,
      grantedAt: { lte: new Date() },
      user: { status: 'ACTIVE', memberships: { some: { organizationId, status: 'ACTIVE' } } },
      OR: [
        { role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' },
        {
          organizationId,
          role: 'ORGANIZATION_ADMIN',
          scopeType: 'ORGANIZATION',
          scopeId: organizationId,
        },
      ],
    },
    select: { userId: true },
  })
  const recipients = [...new Set(roles.map((r) => r.userId))]
  if (recipients.length)
    await tx.userNotification.createMany({
      data: recipients.map((recipientUserId) => ({
        organizationId,
        recipientUserId,
        actorUserId: userId,
        type: 'STUDENT_REGISTRATION' as const,
        title: '新注册学生待核验',
        body: `${realName}已提交学号，请到管理平台「人员与球队」核对。`,
        metadata: { applicationId },
        deduplicationKey: `registration:${applicationId}:${version}`,
      })),
      skipDuplicates: true,
    })
}

export async function attachRegisteredStudent(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  realName: string,
  studentNumber: string,
) {
  const candidates = await tx.studentRecord.findMany({
    where: { organizationId, status: 'ACTIVE', realName: realName.normalize('NFKC').trim() },
    select: { id: true, studentNumber: true, user: { select: { id: true } } },
  })
  if (!candidates.length)
    throw centerError(403, '姓名尚未收录学生名单，暂不能注册，请联系管理员补充')
  const exact = candidates.find((student) => student.studentNumber === studentNumber)
  if (exact) {
    if (exact.user && exact.user.id !== userId) throw centerError(409, '该学生已注册，请登录原账号')
    await tx.user.update({
      where: { id: userId },
      data: {
        profileCohort: 'CURRENT',
        studentRecordId: exact.id,
        studentId: studentNumber,
        studentVerifiedAt: new Date(),
        verificationLevel: 'STUDENT_VERIFIED',
      },
    })
    return null
  }
  if (!candidates.some((student) => !student.studentNumber))
    throw centerError(409, '姓名与已收录学号不匹配，请核对后重试')
  if (candidates.length === 1 && candidates[0]!.user && candidates[0]!.user!.id !== userId)
    throw centerError(409, '该学生已注册，请登录原账号')
  // A proposed number is a claim awaiting review, never evidence for changing the directory.
  const application = await tx.identityApplication.create({
    data: {
      organizationId,
      userId,
      kind: STUDENT_REGISTRATION_KIND,
      message: JSON.stringify({ realName: realName.trim(), studentNumber }),
      status: 'PENDING',
    },
  })
  await tx.user.update({
    where: { id: userId },
    data: { profileCohort: 'CURRENT' },
  })
  await notifyRegistrationAdmins(tx, organizationId, userId, application.id, realName)
  return application.id
}
