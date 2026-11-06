import type { Prisma } from '../generated/prisma/client'
import { registrationOpenToEveryone } from './registration-policy'

type Directory = Pick<Prisma.TransactionClient, 'studentRecord' | 'user'>
export async function registrationCheck(
  db: Directory,
  organizationId: string,
  rawName: string,
  studentNumber: string,
) {
  if (registrationOpenToEveryone())
    return {
      eligible: true,
      reason: 'OPEN_REGISTRATION',
      message: '路演期间开放注册，姓名和学号不影响注册。',
    }
  if (!/^20\d{8}$/.test(studentNumber))
    return { eligible: false, reason: 'INVALID_NUMBER', message: '请填写以20开头的10位学号。' }
  const name = rawName.normalize('NFKC').trim()
  const records = await db.studentRecord.findMany({
    where: { organizationId, status: 'ACTIVE', OR: [{ realName: name }, { studentNumber }] },
    select: { id: true, realName: true, studentNumber: true, user: { select: { id: true } } },
  })
  const names = records.filter((record) => record.realName === name)
  if (!names.length)
    return {
      eligible: false,
      reason: 'NAME_NOT_LISTED',
      message: '姓名不能匹配，请核对姓名，或提交注册问题反馈。',
    }
  const numbered = records.find((record) => record.studentNumber === studentNumber)
  if (!numbered && !names.some((record) => !record.studentNumber))
    return {
      eligible: false,
      reason: 'NAME_NUMBER_MISMATCH',
      message: '姓名与已收录学号不能匹配，请核对后重试。',
    }
  if (numbered && numbered.realName !== name)
    return {
      eligible: false,
      reason: 'NAME_NUMBER_MISMATCH',
      message: '姓名不能匹配，请核对姓名和学号。',
    }
  const existing =
    numbered?.user ||
    (await db.user.findFirst({
      where: {
        memberships: { some: { organizationId } },
        OR: [
          { studentId: studentNumber },
          {
            identityApplications: {
              some: {
                organizationId,
                kind: 'STUDENT_REGISTRATION',
                status: { in: ['PENDING', 'RETURNED'] },
                message: { contains: `"studentNumber":"${studentNumber}"` },
              },
            },
          },
        ],
      },
      select: { id: true },
    }))
  if (existing)
    return {
      eligible: false,
      reason: 'ALREADY_REGISTERED',
      message: '该学号已用于注册，请直接登录；如有疑问可提交反馈。',
    }
  return {
    eligible: true,
    reason: numbered ? 'MATCHED' : 'NUMBER_PENDING',
    message: numbered ? '姓名与学号已匹配。' : '姓名已匹配，提交的学号将由管理员核验。',
  }
}
