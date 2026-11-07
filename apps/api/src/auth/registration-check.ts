import type { Prisma } from '../generated/prisma/client'
import { registrationOpenToEveryone } from './registration-policy'

type Directory = Pick<Prisma.TransactionClient, 'studentRecord' | 'user'>
export async function registrationCheck(
  db: Directory,
  organizationId: string,
  rawName: string,
  studentNumber: string,
  registrationSource?: 'WEAPP' | 'WEB',
) {
  const open = registrationOpenToEveryone()
  const name = typeof rawName === 'string' ? rawName.normalize('NFKC').trim() : ''
  studentNumber = typeof studentNumber === 'string' ? studentNumber.trim() : ''
  if (open && registrationSource !== 'WEAPP' && (!name || !studentNumber))
    return {
      eligible: true,
      reason: 'OPEN_REGISTRATION',
      message: '',
    }
  if (name.length < 2 || name.length > 120)
    return { eligible: false, reason: 'INVALID_NAME', message: '请填写真实姓名。' }
  if (!/^20\d{8}$/.test(studentNumber))
    return { eligible: false, reason: 'INVALID_NUMBER', message: '请填写以20开头的10位学号。' }
  const records = await db.studentRecord.findMany({
    where: { organizationId, status: 'ACTIVE', OR: [{ realName: name }, { studentNumber }] },
    select: { id: true, realName: true, studentNumber: true, user: { select: { id: true } } },
  })
  const names = records.filter((record) => record.realName === name)
  if (!open && !names.length)
    return {
      eligible: false,
      reason: 'NAME_NOT_LISTED',
      message: '姓名不能匹配，请核对姓名，或提交注册问题反馈。',
    }
  const numbered = records.find((record) => record.studentNumber === studentNumber)
  if (!open && !numbered && !names.some((record) => !record.studentNumber))
    return {
      eligible: false,
      reason: 'NAME_NUMBER_MISMATCH',
      message: '姓名与已收录学号不能匹配，请核对后重试。',
    }
  if (!open && numbered && numbered.realName !== name)
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
    reason: numbered?.realName === name ? 'MATCHED' : open ? 'UNMATCHED' : 'NUMBER_PENDING',
    message: numbered?.realName === name ? '姓名与学号已匹配。' : '',
  }
}
