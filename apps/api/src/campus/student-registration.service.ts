import { Inject, Injectable } from '@nestjs/common'
import { CampusCommandService } from './campus-command.service'
import { centerError } from '../admin-center/admin-center.policy'
import { academicYearFromNumber } from './student-catalog'
import { createAdminNotice } from '../social/admin-notice'
import { allocateUsername, renameUsername, usernameStem } from '../auth/usernames'
import {
  STUDENT_REGISTRATION_KIND,
  submittedRegistration,
  notifyRegistrationAdmins,
} from './student-registration'
import type {
  StudentRegistrationCorrectionDto,
  StudentRegistrationReviewDto,
} from './student-registration.dto'

const applicant = {
  id: true,
  realName: true,
  displayName: true,
  loginNameNormalized: true,
  studentRecordId: true,
  studentId: true,
} as const

@Injectable()
export class StudentRegistrationService {
  constructor(@Inject(CampusCommandService) readonly command: CampusCommandService) {}

  list(auth: string | undefined, admin: boolean) {
    return this.command.read(auth, admin, async (tx, actor) => {
      const items = await tx.identityApplication.findMany({
        where: {
          organizationId: actor.organizationId,
          kind: STUDENT_REGISTRATION_KIND,
          ...(admin ? { status: 'PENDING' } : { userId: actor.userId }),
        },
        include: { user: { select: applicant } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: admin ? 200 : 1,
      })
      if (admin)
        items.push(
          ...(await tx.identityApplication.findMany({
            where: {
              organizationId: actor.organizationId,
              kind: STUDENT_REGISTRATION_KIND,
              status: { not: 'PENDING' },
            },
            include: { user: { select: applicant } },
            orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
            take: 20,
          })),
        )
      const current = admin
        ? null
        : await tx.user.findUniqueOrThrow({
            where: { id: actor.userId },
            select: { realName: true, studentId: true },
          })
      return {
        ...(current
          ? {
              current: { realName: current.realName || '', studentNumber: current.studentId || '' },
            }
          : {}),
        items: await Promise.all(
          items.map(async (item) => {
            const submitted = submittedRegistration(item.message, item.user.realName || '')
            return {
              id: item.id,
              version: item.version,
              status: item.status,
              realName: submitted.realName,
              studentNumber: submitted.studentNumber,
              reason: submitted.reason,
              user: item.user,
              currentStudentRecordId: item.user.studentRecordId,
              decisionNote: item.decisionNote,
              createdAt: item.createdAt,
              ...(admin
                ? {
                    candidates: await tx.studentRecord.findMany({
                      where: {
                        organizationId: actor.organizationId,
                        status: 'ACTIVE',
                        OR: [
                          { realName: submitted.realName },
                          ...(item.user.studentRecordId ? [{ id: item.user.studentRecordId }] : []),
                        ],
                      },
                      select: {
                        id: true,
                        realName: true,
                        studentNumber: true,
                        collegeName: true,
                        version: true,
                        user: { select: { id: true } },
                      },
                      orderBy: { id: 'asc' },
                    }),
                  }
                : {}),
            }
          }),
        ),
      }
    })
  }

  review(
    auth: string | undefined,
    id: string,
    body: StudentRegistrationReviewDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(
      auth,
      `campus:registration:${id}`,
      body,
      key,
      true,
      async (tx, actor) => {
        const application = await tx.identityApplication.findFirst({
          where: {
            id,
            organizationId: actor.organizationId,
            kind: STUDENT_REGISTRATION_KIND,
            status: 'PENDING',
            version: body.expectedVersion,
          },
          include: { user: true },
        })
        if (!application) throw centerError(409, '申请已变化或已处理，请刷新核对')
        if (application.userId === actor.userId) throw centerError(403, '不能核验自己的注册资料')
        if (application.user.status !== 'ACTIVE')
          throw centerError(409, '申请账号已停用，请先核对账号状态')
        const proposed = submittedRegistration(application.message, application.user.realName || '')
        if (!proposed.studentNumber || proposed.realName.length < 2)
          throw centerError(409, '提交资料不完整，请联系用户更正')
        const claim = await tx.identityApplication.updateMany({
          where: {
            id,
            organizationId: actor.organizationId,
            status: 'PENDING',
            version: body.expectedVersion,
          },
          data: {
            status: body.decision === 'APPROVE' ? 'APPROVED' : 'RETURNED',
            decisionNote: body.reason,
            reviewedByUserId: actor.userId,
            reviewedAt: new Date(),
            version: { increment: 1 },
          },
        })
        if (claim.count !== 1) throw centerError(409, '申请已被其他操作更新')
        let studentRecordId: string | null = application.user.studentRecordId
        if (body.decision === 'APPROVE') {
          await this.command.requireUserProfileWrite(tx, actor, application.userId)
          if (
            proposed.previousRealName !== undefined &&
            proposed.previousRealName !== (application.user.realName || '')
          )
            throw centerError(409, '申请后的姓名已被其他管理员修改，请重新提交申请')
          if (
            proposed.previousStudentNumber !== undefined &&
            proposed.previousStudentNumber !== (application.user.studentId || '')
          )
            throw centerError(409, '申请后的学号已被其他管理员修改，请重新提交申请')
          if (studentRecordId && body.studentRecordId && studentRecordId !== body.studentRecordId)
            throw centerError(409, '用户已有学生关联，不能替换稳定身份记录')
          studentRecordId ||= body.studentRecordId || null
          if (!studentRecordId) {
            const candidates = await tx.studentRecord.findMany({
              where: {
                organizationId: actor.organizationId,
                status: 'ACTIVE',
                realName: proposed.realName,
                AND: [
                  { OR: [{ studentNumber: null }, { studentNumber: proposed.studentNumber }] },
                  { OR: [{ user: { is: null } }, { user: { is: { id: application.userId } } }] },
                ],
              },
              select: { id: true },
              take: 2,
            })
            if (candidates.length > 1) throw centerError(409, '有同名学生档案，请选择核实后的记录')
            studentRecordId = candidates[0]?.id || null
          }
          if (
            (await tx.studentRecord.findFirst({
              where: {
                organizationId: actor.organizationId,
                studentNumber: proposed.studentNumber,
                ...(studentRecordId ? { id: { not: studentRecordId } } : {}),
              },
              select: { id: true },
            })) ||
            (await tx.user.findFirst({
              where: { studentId: proposed.studentNumber, id: { not: application.userId } },
              select: { id: true },
            }))
          )
            throw centerError(409, '学号已被其他档案或账号使用，请核对后处理')
          let student = studentRecordId
            ? await tx.studentRecord.findFirst({
                where: {
                  id: studentRecordId,
                  organizationId: actor.organizationId,
                  status: 'ACTIVE',
                },
                include: { user: { select: { id: true } }, player: { select: { id: true } } },
              })
            : null
          if (studentRecordId && !student) throw centerError(409, '学生档案不存在或不属于当前组织')
          if (student?.user && student.user.id !== application.userId)
            throw centerError(409, '该学生档案已关联其他账号')
          if (
            student &&
            !application.user.studentRecordId &&
            (student.realName !== proposed.realName ||
              (student.studentNumber && student.studentNumber !== proposed.studentNumber))
          )
            throw centerError(409, '所选学生档案与申请资料不符')
          if (student) {
            await tx.studentRecord.update({
              where: { id: student.id, version: student.version },
              data: {
                realName: proposed.realName,
                studentNumber: proposed.studentNumber,
                academicYear: academicYearFromNumber(proposed.studentNumber),
                version: { increment: 1 },
              },
            })
          } else {
            student = await tx.studentRecord.create({
              data: {
                organizationId: actor.organizationId,
                realName: proposed.realName,
                studentNumber: proposed.studentNumber,
                academicYear: academicYearFromNumber(proposed.studentNumber),
                sourceType: 'REGISTRATION_REVIEW',
              },
              include: { user: { select: { id: true } }, player: { select: { id: true } } },
            })
          }
          studentRecordId = student.id
          await tx.user.update({
            where: { id: application.userId },
            data: {
              realName: proposed.realName,
              realNameNormalized: proposed.realName.normalize('NFKC').toLowerCase(),
              studentId: proposed.studentNumber,
              studentRecordId,
              studentVerifiedAt: new Date(),
              profileCohort: 'CURRENT',
              ...(application.user.verificationLevel === 'UNVERIFIED'
                ? { verificationLevel: 'STUDENT_VERIFIED' }
                : {}),
            },
          })
          if (student.player)
            await tx.playerProfile.update({
              where: { id: student.player.id },
              data: {
                studentId: proposed.studentNumber,
                studentIdMasked: `${proposed.studentNumber.slice(0, 2)}****${proposed.studentNumber.slice(-2)}`,
                academicYear: academicYearFromNumber(proposed.studentNumber),
              },
            })
          const stem = usernameStem(proposed.realName)
          if (
            stem &&
            !new RegExp(`^${stem}\\d{3}$`).test(application.user.loginNameNormalized || '')
          )
            await renameUsername(
              tx,
              application.user,
              await allocateUsername(tx, proposed.realName),
            )
          await tx.identityApplication.update({
            where: { id },
            data: { resolvedCandidateId: studentRecordId },
          })
          await tx.userNotification.create({
            data: {
              organizationId: actor.organizationId,
              recipientUserId: application.userId,
              actorUserId: actor.userId,
              type: 'STUDENT_REGISTRATION',
              title: '姓名与学号核验通过',
              body: '你的身份资料已由管理员核验，个人资料已更新。',
              linkPath: '/pages/me/index?profile=information',
              metadata: { applicationId: id },
              deduplicationKey: `registration-approved:${id}:${body.expectedVersion}`,
            },
          })
        } else {
          const deadlineAt = new Date(
            Date.now() + (body.deadlineDays || 14) * 86400000,
          ).toISOString()
          await createAdminNotice(tx, {
            organizationId: actor.organizationId,
            senderUserId: actor.userId,
            recipientUserId: application.userId,
            clientMessageId: `registration-review:${id}:${body.expectedVersion}`,
            title: '请核对姓名与学号',
            body: `${body.reason.trim()}\n请在${body.deadlineDays || 14}天内前往「我的 → 个人资料 → 姓名或学号有误？」提交正确信息。请及时更正，以免影响账号使用。`,
            applicationId: id,
            deadlineAt,
            actionPath: '/pages/me/index?profile=information&correction=1',
          })
        }
        await this.command.audit(
          tx,
          actor,
          'STUDENT_REGISTRATION_REVIEWED',
          'IdentityApplication',
          id,
          body.reason,
          requestId,
          { version: body.expectedVersion },
          { decision: body.decision, studentRecordId },
        )
        return { saved: true }
      },
    )
  }

  correct(
    auth: string | undefined,
    body: StudentRegistrationCorrectionDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(
      auth,
      'campus:registration:correct',
      body,
      key,
      false,
      async (tx, actor) => {
        const [application, user] = await Promise.all([
          tx.identityApplication.findFirst({
            where: {
              organizationId: actor.organizationId,
              userId: actor.userId,
              kind: STUDENT_REGISTRATION_KIND,
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          }),
          tx.user.findUniqueOrThrow({
            where: { id: actor.userId },
            select: { realName: true, studentId: true },
          }),
        ])
        if ((application?.version || 0) !== body.expectedVersion)
          throw centerError(409, '申请状态已变化，请刷新后核对')
        const realName = (body.realName || user.realName || '').normalize('NFKC').trim()
        if (realName.length < 2) throw centerError(400, '请填写要更正的真实姓名')
        const message = JSON.stringify({
          realName,
          studentNumber: body.studentNumber,
          reason: body.reason?.trim() || '',
          previousRealName: user.realName || '',
          previousStudentNumber: user.studentId || '',
        })
        if (message.length > 1000) throw centerError(400, '更正说明过长，请简要填写')
        let id: string, version: number
        if (application && ['PENDING', 'RETURNED'].includes(application.status)) {
          const changed = await tx.identityApplication.updateMany({
            where: {
              id: application.id,
              version: body.expectedVersion,
              status: application.status,
            },
            data: {
              message,
              status: 'PENDING',
              decisionNote: null,
              reviewedAt: null,
              reviewedByUserId: null,
              resolvedCandidateId: null,
              version: { increment: 1 },
            },
          })
          if (changed.count !== 1) throw centerError(409, '申请已变化，请刷新核对')
          id = application.id
          version = body.expectedVersion + 1
        } else {
          const created = await tx.identityApplication.create({
            data: {
              organizationId: actor.organizationId,
              userId: actor.userId,
              kind: STUDENT_REGISTRATION_KIND,
              message,
              status: 'PENDING',
            },
          })
          id = created.id
          version = created.version
        }
        await notifyRegistrationAdmins(
          tx,
          actor.organizationId,
          actor.userId,
          id,
          realName,
          version,
        )
        await this.command.audit(
          tx,
          actor,
          'STUDENT_REGISTRATION_RESUBMITTED',
          'IdentityApplication',
          id,
          body.reason?.trim() || '申请核对本人姓名或学号',
          requestId,
          { version: body.expectedVersion },
          { version },
        )
        return { saved: true }
      },
    )
  }
}
