import { Inject, Injectable } from '@nestjs/common'
import { CampusCommandService } from './campus-command.service'
import { centerError } from '../admin-center/admin-center.policy'
import { academicYearFromNumber } from './student-catalog'
import {
  STUDENT_REGISTRATION_KIND,
  submittedStudentNumber,
  notifyRegistrationAdmins,
  autoRecordStudentNumber,
} from './student-registration'
import type {
  StudentRegistrationCorrectionDto,
  StudentRegistrationReviewDto,
} from './student-registration.dto'

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
        include: {
          user: {
            select: { id: true, realName: true, displayName: true, loginNameNormalized: true },
          },
        },
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
            include: {
              user: {
                select: { id: true, realName: true, displayName: true, loginNameNormalized: true },
              },
            },
            orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
            take: 20,
          })),
        )
      return {
        items: await Promise.all(
          items.map(async (item) => ({
            id: item.id,
            version: item.version,
            status: item.status,
            realName: item.user.realName,
            user: item.user,
            studentNumber: submittedStudentNumber(item.message),
            decisionNote: item.decisionNote,
            createdAt: item.createdAt,
            ...(admin
              ? {
                  candidates: await tx.studentRecord.findMany({
                    where: {
                      organizationId: actor.organizationId,
                      status: 'ACTIVE',
                      realName: item.user.realName ?? '',
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
          })),
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
        const number = submittedStudentNumber(application.message)
        if (!number || !application.user.realName)
          throw centerError(409, '提交资料不完整，请联系用户更正')
        let studentRecordId = body.studentRecordId
        if (body.decision === 'APPROVE') {
          if (!studentRecordId) {
            const candidates = await tx.studentRecord.findMany({
              where: {
                organizationId: actor.organizationId,
                status: 'ACTIVE',
                realName: application.user.realName,
                AND: [
                  { OR: [{ studentNumber: null }, { studentNumber: number }] },
                  { OR: [{ user: { is: null } }, { user: { is: { id: application.userId } } }] },
                ],
              },
              select: { id: true },
              take: 2,
            })
            if (candidates.length !== 1)
              throw centerError(409, '有重名或已关联的学生档案，请选择核实后的记录')
            studentRecordId = candidates[0]!.id
          }
          const student = await tx.studentRecord.findFirst({
            where: {
              id: studentRecordId,
              organizationId: actor.organizationId,
              status: 'ACTIVE',
              realName: application.user.realName,
            },
            include: { user: { select: { id: true } }, player: { select: { id: true } } },
          })
          if (!student) throw centerError(409, '学生档案不匹配，请刷新核对')
          if (student.studentNumber && student.studentNumber !== number)
            throw centerError(409, '提交学号与现有档案不符，请通知用户更正')
          if (student.user && student.user.id !== application.userId)
            throw centerError(409, '该学生档案已关联其他账号，请核对重名或原账号')
          if (application.user.studentRecordId && application.user.studentRecordId !== student.id)
            throw centerError(409, '用户已有学生关联，不能自动覆盖')
          if (
            (await tx.studentRecord.findFirst({
              where: {
                organizationId: actor.organizationId,
                studentNumber: number,
                id: { not: student.id },
              },
              select: { id: true },
            })) ||
            (await tx.user.findFirst({
              where: { studentId: number, id: { not: application.userId } },
              select: { id: true },
            }))
          )
            throw centerError(409, '学号已被其他档案或账号使用，请核对后处理')
          await this.command.requireUserProfileWrite(tx, actor, application.userId)
          await tx.studentRecord.update({
            where: { id: student.id, version: student.version },
            data: {
              studentNumber: number,
              academicYear: academicYearFromNumber(number),
              version: { increment: 1 },
            },
          })
          await tx.user.update({
            where: { id: application.userId },
            data: {
              studentId: number,
              studentRecordId: student.id,
              studentVerifiedAt: new Date(),
              ...(application.user.verificationLevel === 'UNVERIFIED'
                ? { verificationLevel: 'STUDENT_VERIFIED' }
                : {}),
            },
          })
          if (student.player)
            await tx.playerProfile.update({
              where: { id: student.player.id },
              data: {
                studentId: number,
                studentIdMasked: `${number.slice(0, 2)}****${number.slice(-2)}`,
                academicYear: academicYearFromNumber(number),
              },
            })
        }
        const changed = await tx.identityApplication.updateMany({
          where: {
            id,
            organizationId: actor.organizationId,
            kind: STUDENT_REGISTRATION_KIND,
            status: 'PENDING',
            version: body.expectedVersion,
          },
          data: {
            status: body.decision === 'APPROVE' ? 'APPROVED' : 'RETURNED',
            decisionNote: body.reason,
            reviewedByUserId: actor.userId,
            reviewedAt: new Date(),
            resolvedCandidateId: body.decision === 'APPROVE' ? studentRecordId! : null,
            version: { increment: 1 },
          },
        })
        if (changed.count !== 1) throw centerError(409, '申请已被其他操作更新')
        if (body.decision === 'RETURN')
          await tx.userNotification.create({
            data: {
              organizationId: actor.organizationId,
              recipientUserId: application.userId,
              actorUserId: actor.userId,
              type: 'STUDENT_REGISTRATION',
              title: '请更正注册学号',
              body: body.reason.slice(0, 500),
              linkPath: '/pages/me/index?profile=information',
              metadata: { applicationId: id },
              deduplicationKey: `registration-review:${id}:${body.expectedVersion}`,
            },
          })
        await this.command.audit(
          tx,
          actor,
          'STUDENT_REGISTRATION_REVIEWED',
          'IdentityApplication',
          id,
          body.reason,
          requestId,
          { version: body.expectedVersion },
          { decision: body.decision, studentRecordId: studentRecordId ?? null },
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
        const application = await tx.identityApplication.findFirst({
          where: {
            organizationId: actor.organizationId,
            userId: actor.userId,
            kind: STUDENT_REGISTRATION_KIND,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: { user: { select: { realName: true } } },
        })
        if (
          !application ||
          !['PENDING', 'RETURNED'].includes(application.status) ||
          application.version !== body.expectedVersion
        )
          throw centerError(409, '当前申请不能更改，请刷新核对')
        const changed = await tx.identityApplication.updateMany({
          where: { id: application.id, version: body.expectedVersion, status: application.status },
          data: {
            message: JSON.stringify({
              realName: application.user.realName,
              studentNumber: body.studentNumber,
            }),
            status: 'PENDING',
            decisionNote: null,
            reviewedAt: null,
            reviewedByUserId: null,
            version: { increment: 1 },
          },
        })
        if (changed.count !== 1) throw centerError(409, '申请已变化，请刷新核对')
        const recorded = await autoRecordStudentNumber(
          tx, actor.organizationId, actor.userId, application.user.realName ?? '', body.studentNumber,
        )
        if (recorded) await tx.identityApplication.update({
          where: { id: application.id },
          data: { status: 'APPROVED', reviewedAt: new Date(), decisionNote: '符合学号规则，自动收录' },
        })
        else await notifyRegistrationAdmins(
          tx,
          actor.organizationId,
          actor.userId,
          application.id,
          application.user.realName ?? '学生',
          body.expectedVersion + 1,
        )
        await this.command.audit(
          tx,
          actor,
          'STUDENT_REGISTRATION_RESUBMITTED',
          'IdentityApplication',
          application.id,
          body.reason,
          requestId,
          { version: body.expectedVersion },
          { version: body.expectedVersion + 1 },
        )
        return { saved: true }
      },
    )
  }
}
