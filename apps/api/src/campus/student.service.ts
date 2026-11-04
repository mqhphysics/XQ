import { Inject, Injectable } from '@nestjs/common'
import { centerError } from '../admin-center/admin-center.policy'
import { CampusCommandService, type CampusTx } from './campus-command.service'
import type { AuthenticatedSession } from '../auth/auth.service'
import type {
  CampusOnboardingDto,
  CampusProfileDto,
  CampusMediaDto,
  CampusPlayerDto,
  CampusVersionDto,
  StudentAccountLinkDto,
  StudentPlayerLinkDto,
  StudentRecordDto,
} from './campus.dto'
import { MediaService } from '../media/media.service'
import { createHash } from 'node:crypto'
import { academicYearFromNumber, studentCatalog } from './student-catalog'
import { withDefaultPersonMedia } from '../media/default-media'

const userView = {
  id: true,
  displayName: true,
  loginNameNormalized: true,
  realName: true,
  studentId: true,
  email: true,
  avatarUrl: true,
  coverUrl: true,
  bio: true,
  status: true,
  profileCohort: true,
  updatedAt: true,
  studentVerifiedAt: true,
  onboardingCompletedAt: true,
  playerProfileId: true,
  roleAssignments: {
    where: { revokedAt: null },
    select: { role: true, scopeType: true, scopeId: true },
  },
  passwordCredential: { select: { id: true } },
} as const
const studentView = { user: { select: userView }, player: true } as const
const normal = (value: string) => value.normalize('NFKC').trim().toLowerCase()

@Injectable()
export class StudentService {
  constructor(
    @Inject(CampusCommandService) readonly command: CampusCommandService,
    @Inject(MediaService) readonly media: MediaService,
  ) {}

  options(auth: string | undefined) {
    return this.command.read(auth, true, async () => studentCatalog())
  }

  list(
    auth: string | undefined,
    query = '',
    cohort = '',
    page = 1,
    kind = 'students',
    requestId = 'campus-directory-read',
    collegeName = '',
    academicYear = '',
  ) {
    return this.command.read(auth, true, async (tx, actor) => {
      const term = query.trim().slice(0, 120),
        currentPage = Math.max(1, Math.min(10000, Number(page) || 1))
      const where = {
        organizationId: actor.organizationId,
        ...(collegeName ? { collegeName } : {}),
        ...(academicYear ? { academicYear } : {}),
        ...(cohort ? { cohort } : {}),
        ...(kind === 'players'
          ? { player: { isNot: null } }
          : kind === 'users'
            ? { user: { is: cohort === 'DEMO_2026' ? { profileCohort: cohort } : {} } }
            : {}),
        ...(term
          ? {
              OR: [
                { realName: { contains: term, mode: 'insensitive' as const } },
                { studentNumber: { contains: term, mode: 'insensitive' as const } },
                {
                  user: {
                    is: {
                      OR: [
                        { displayName: { contains: term, mode: 'insensitive' as const } },
                        { loginNameNormalized: { contains: term, mode: 'insensitive' as const } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      }
      const [total, items, cohorts] = await Promise.all([
        tx.studentRecord.count({ where }),
        tx.studentRecord.findMany({
          where,
          include: studentView,
          orderBy: [{ studentNumber: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
          skip: (currentPage - 1) * 20,
          take: 20,
        }),
        tx.studentRecord.groupBy({
          by: ['cohort'],
          where: { organizationId: actor.organizationId },
          _count: true,
        }),
      ])
      await this.command.audit(
        tx,
        actor,
        'STUDENT_DIRECTORY_VIEWED',
        'Organization',
        actor.organizationId,
        '管理员查看学生及关联账号、球员资料',
        requestId,
        null,
        { count: items.length, page: currentPage, kind, cohort },
      )
      return {
        items: items.map((s) => ({
          ...s,
          player: s.player ? withDefaultPersonMedia('player', s.player) : null,
          user: s.user
            ? {
                ...withDefaultPersonMedia('user', s.user),
                hasPassword: !!s.user.passwordCredential,
                passwordCredential: undefined,
              }
            : null,
        })),
        total,
        page: currentPage,
        pageSize: 20,
        cohorts,
      }
    })
  }

  detail(auth: string | undefined, id: string, requestId = 'campus-student-read') {
    return this.command.read(auth, true, async (tx, actor) => {
      const student = await tx.studentRecord.findFirst({
        where: { id, organizationId: actor.organizationId },
        include: studentView,
      })
      if (!student) throw centerError(404, '学生档案不存在')
      const memberships = student.player
        ? await tx.teamMembership.findMany({
            where: { playerProfileId: student.player.id, organizationId: actor.organizationId },
            include: { team: { select: { id: true, name: true, crestUrl: true } } },
          })
        : []
      const snapshots = student.player
        ? await tx.rosterSnapshotEntry.findMany({
            where: { playerProfileId: student.player.id, organizationId: actor.organizationId },
            include: {
              rosterSnapshot: {
                include: {
                  tournament: { include: { season: true, competitionDefinition: true } },
                  team: { select: { id: true, name: true } },
                },
              },
            },
            take: 100,
          })
        : []
      await this.command.audit(
        tx,
        actor,
        'STUDENT_RECORD_VIEWED',
        'StudentRecord',
        id,
        '管理员查看学生实名、学号与关联资料',
        requestId,
        null,
        { userId: student.user?.id ?? null, playerId: student.player?.id ?? null },
      )
      const pendingMedia = await tx.managedMediaAsset.findMany({
        where: {
          organizationId: actor.organizationId,
          targetId: {
            in: [student.user?.id, student.player?.id].filter((id): id is string => !!id),
          },
          purpose: { in: ['USER_AVATAR', 'USER_BACKGROUND', 'PLAYER_PORTRAIT'] },
          // Pre-moderated submissions plus post-moderated profile images awaiting a check.
          OR: [{ status: 'PENDING' }, { status: 'APPROVED', reviewedAt: null }],
          visibility: 'ACTIVE',
        },
        select: {
          id: true,
          purpose: true,
          targetId: true,
          version: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      return {
        ...student,
        player: student.player ? withDefaultPersonMedia('player', student.player) : null,
        pendingMedia,
        user: student.user
          ? {
              ...withDefaultPersonMedia('user', student.user),
              hasPassword: !!student.user.passwordCredential,
              passwordCredential: undefined,
            }
          : null,
        memberships,
        seasons: snapshots,
      }
    })
  }

  save(
    auth: string | undefined,
    id: string | undefined,
    body: StudentRecordDto,
    key: string | undefined,
    requestId: string,
  ) {
    if (id && body.reason.trim().length < 2) throw centerError(400, '修改已有学生资料时请填写原因')
    return this.command.write(
      auth,
      `campus:student:${id ?? 'new'}`,
      body,
      key,
      true,
      async (tx, actor) => {
        const previous = id
          ? await tx.studentRecord.findFirst({
              where: { id, organizationId: actor.organizationId },
              include: { user: { select: { id: true } }, player: { select: { id: true } } },
            })
          : null
        if (id && !previous) throw centerError(404, '学生档案不存在')
        if (previous && body.expectedVersion !== previous.version)
          throw centerError(409, '学生档案已更新，请重新读取')
        const data = {
          realName: body.realName.trim(),
          studentNumber:
            body.studentNumber === undefined
              ? (previous?.studentNumber ?? null)
              : body.studentNumber?.trim() || null,
          gender: body.gender,
          collegeName: body.collegeName ?? previous?.collegeName ?? '',
          academicYear: '',
          status: body.status ?? 'ACTIVE',
        }
        data.academicYear =
          academicYearFromNumber(data.studentNumber) ||
          (body.academicYear === undefined ? (previous?.academicYear ?? '') : body.academicYear)
        if (previous?.user && !data.studentNumber)
          throw centerError(400, '已关联账号的学号不能留空，请先核对身份资料')
        const student = previous
          ? await tx.studentRecord.update({
              where: { id: previous.id, version: previous.version },
              data: { ...data, version: { increment: 1 } },
            })
          : await tx.studentRecord.create({
              data: { ...data, organizationId: actor.organizationId },
            })
        if (previous?.user) await this.command.requireUserProfileWrite(tx, actor, previous.user.id)
        if (previous?.user)
          await tx.user.update({
            where: { id: previous.user.id },
            data: {
              realName: student.realName,
              realNameNormalized: normal(student.realName),
              studentId: student.studentNumber,
            },
          })
        if (previous?.player)
          await tx.playerProfile.update({
            where: { id: previous.player.id },
            data: {
              displayName: student.realName,
              studentId: student.studentNumber,
              studentIdMasked: mask(student.studentNumber),
              academicYear: student.academicYear,
            },
          })
        await this.command.audit(
          tx,
          actor,
          'STUDENT_RECORD_SAVED',
          'StudentRecord',
          student.id,
          body.reason || '新增学生档案',
          requestId,
          previous,
          student,
        )
        return student
      },
    )
  }

  linkUser(
    auth: string | undefined,
    id: string,
    body: StudentAccountLinkDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(
      auth,
      `campus:student:${id}:user`,
      body,
      key,
      true,
      async (tx, actor) => {
        const student = await this.versionedStudent(tx, actor, id, body.expectedVersion)
        const user = await tx.user.findFirst({
          where: {
            id: body.userId,
            status: 'ACTIVE',
            memberships: { some: { organizationId: actor.organizationId, status: 'ACTIVE' } },
          },
        })
        if (!user) throw centerError(404, '该组织内的用户不存在')
        await this.command.requireUserProfileWrite(tx, actor, user.id)
        if (!student.studentNumber) throw centerError(400, '请先补全学生学号，再核验账号关联')
        if (user.studentRecordId && user.studentRecordId !== id)
          throw centerError(409, '该用户已关联其他学生档案')
        const existing = await tx.user.findUnique({
          where: { studentRecordId: id },
          select: { id: true },
        })
        if (existing && existing.id !== user.id)
          throw centerError(409, '该学生已有账号，请处理原账号后再关联')
        const updated = await tx.user.update({
          where: { id: user.id },
          data: {
            studentRecordId: id,
            studentVerifiedAt: new Date(),
            realName: student.realName,
            realNameNormalized: normal(student.realName),
            studentId: student.studentNumber,
          },
        })
        await tx.studentRecord.update({
          where: { id, version: student.version },
          data: { version: { increment: 1 }, status: 'ACTIVE' },
        })
        await this.command.audit(
          tx,
          actor,
          'STUDENT_ACCOUNT_LINKED',
          'StudentRecord',
          id,
          body.reason,
          requestId,
          { userId: existing?.id ?? null },
          { userId: updated.id, studentVerified: true },
        )
        return { id, userId: updated.id }
      },
    )
  }

  linkPlayer(
    auth: string | undefined,
    id: string,
    body: StudentPlayerLinkDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(
      auth,
      `campus:student:${id}:player`,
      body,
      key,
      true,
      async (tx, actor) => {
        const student = await this.versionedStudent(tx, actor, id, body.expectedVersion)
        const player = await tx.playerProfile.findFirst({
          where: { id: body.playerId, organizationId: actor.organizationId },
          include: { linkedUser: { select: { studentRecordId: true } } },
        })
        if (!player) throw centerError(404, '球员档案不属于当前组织')
        if (player.studentRecordId && player.studentRecordId !== id)
          throw centerError(409, '球员档案已关联其他学生')
        if (player.linkedUser && player.linkedUser.studentRecordId !== id)
          throw centerError(409, '请先核查球员已有账号，不能覆盖原关联')
        await tx.playerProfile.update({
          where: { id: player.id },
          data: {
            studentRecordId: id,
            displayName: student.realName,
            studentId: student.studentNumber,
            studentIdMasked: mask(student.studentNumber),
          },
        })
        await tx.studentRecord.update({
          where: { id, version: student.version },
          data: { version: { increment: 1 } },
        })
        await this.command.audit(
          tx,
          actor,
          'STUDENT_PLAYER_LINKED',
          'StudentRecord',
          id,
          body.reason,
          requestId,
          null,
          { playerId: player.id },
        )
        return { id, playerId: player.id }
      },
    )
  }

  createPlayer(
    auth: string | undefined,
    id: string,
    body: CampusVersionDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(
      auth,
      `campus:student:${id}:create-player`,
      body,
      key,
      true,
      async (tx, actor) => {
        const student = await this.versionedStudent(tx, actor, id, body.expectedVersion)
        const existing = await tx.playerProfile.findUnique({ where: { studentRecordId: id } })
        if (existing) throw centerError(409, '该学生已有球员档案，请直接维护原档案')
        const player = await tx.playerProfile.create({
          data: {
            organizationId: actor.organizationId,
            studentRecordId: id,
            displayName: student.realName,
            studentId: student.studentNumber,
            studentIdMasked: mask(student.studentNumber),
            isDemo: student.isDemo,
            sourceType: student.isDemo ? 'DEMO_FIXTURE' : 'ADMIN_CREATED',
            sourceKey: `student:${id}`,
            academicYear: student.academicYear,
          },
        })
        await tx.studentRecord.update({
          where: { id, version: student.version },
          data: { version: { increment: 1 } },
        })
        await this.command.audit(
          tx,
          actor,
          'STUDENT_PLAYER_PROFILE_CREATED',
          'PlayerProfile',
          player.id,
          body.reason,
          requestId,
          null,
          { studentId: id, playerId: player.id },
        )
        return player
      },
    )
  }

  me(auth: string | undefined) {
    return this.command.read(auth, false, async (tx, actor) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          coverUrl: true,
          bio: true,
          verificationLevel: true,
          studentVerifiedAt: true,
          onboardingCompletedAt: true,
          playerOfferDismissedAt: true,
          studentRecord: {
            include: {
              player: {
                select: {
                  id: true,
                  displayName: true,
                  portraitUrl: true,
                  avatarUrl: true,
                  studentRecordId: true,
                  linkedUser: { select: { id: true } },
                },
              },
            },
          },
          playerProfileId: true,
        },
      })
      const player = user.studentRecord?.player
      return {
        ...user,
        playerCandidate:
          player &&
          user.studentVerifiedAt &&
          user.verificationLevel !== 'PLAYER_CONFIRMED' &&
          (!user.playerProfileId || user.playerProfileId === player.id) &&
          (!player.linkedUser || player.linkedUser.id === user.id)
            ? {
                id: player.id,
                name: player.displayName,
                portraitUrl: player.portraitUrl ?? player.avatarUrl,
              }
            : null,
        identityNeedsReview: !!user.studentRecord && !user.studentVerifiedAt,
      }
    })
  }

  onboarding(
    auth: string | undefined,
    body: CampusOnboardingDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(auth, 'campus:onboarding', body, key, false, async (tx, actor) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        include: { studentRecord: { include: { player: true } } },
      })
      if (body.action === 'TUTORIAL_COMPLETE')
        await tx.user.update({
          where: { id: user.id },
          data: { onboardingCompletedAt: new Date() },
        })
      else if (body.action === 'DISMISS_PLAYER')
        await tx.user.update({
          where: { id: user.id },
          data: { playerOfferDismissedAt: new Date() },
        })
      else {
        const player = user.studentRecord?.player
        if (
          !user.onboardingCompletedAt ||
          !user.studentVerifiedAt ||
          !player ||
          player.id !== body.playerId ||
          player.organizationId !== actor.organizationId
        )
          throw centerError(403, '请先完成引导并核验学生身份，再确认自己的球员档案')
        if (user.playerProfileId && user.playerProfileId !== player.id)
          throw centerError(409, '账号已有其他球员关联')
        const claimed = await tx.user.findFirst({
          where: { playerProfileId: player.id, id: { not: user.id } },
          select: { id: true },
        })
        if (claimed) throw centerError(409, '该球员已关联其他账号，请联系管理员')
        await tx.user.update({
          where: { id: user.id },
          data: {
            playerProfileId: player.id,
            verificationLevel: 'PLAYER_CONFIRMED',
            playerOfferDismissedAt: new Date(),
          },
        })
      }
      await this.command.audit(
        tx,
        actor,
        'CAMPUS_ONBOARDING',
        'User',
        user.id,
        '用户完成引导或确认本人球员档案',
        requestId,
        null,
        { action: body.action, playerId: body.playerId ?? null },
      )
      return { saved: true, action: body.action }
    })
  }

  editUser(
    auth: string | undefined,
    id: string,
    body: CampusProfileDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(auth, `campus:profile:${id}`, body, key, true, async (tx, actor) => {
      const user = await tx.user.findFirst({
        where: { id, memberships: { some: { organizationId: actor.organizationId } } },
        select: {
          id: true,
          displayName: true,
          bio: true,
          avatarUrl: true,
          coverUrl: true,
          updatedAt: true,
        },
      })
      if (!user) throw centerError(404, '用户不存在')
      await this.command.requireUserProfileWrite(tx, actor, user.id)
      if (user.updatedAt.toISOString() !== new Date(body.expectedUpdatedAt).toISOString())
        throw centerError(409, '用户资料已更新，请刷新')
      const { reason, expectedUpdatedAt, ...data } = body
      for (const value of [data.avatarUrl, data.coverUrl])
        if (value && !/^\/api\/media\//.test(value))
          throw centerError(400, '请使用已上传的站内图片')
      const result = await tx.user.update({
        where: { id, updatedAt: user.updatedAt },
        data,
        select: {
          id: true,
          displayName: true,
          bio: true,
          avatarUrl: true,
          coverUrl: true,
          updatedAt: true,
        },
      })
      await this.command.audit(
        tx,
        actor,
        'CAMPUS_USER_PROFILE_UPDATED',
        'User',
        id,
        reason,
        requestId,
        user,
        result,
      )
      return result
    })
  }

  editPlayer(
    auth: string | undefined,
    id: string,
    body: CampusPlayerDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(auth, `campus:player:${id}`, body, key, true, async (tx, actor) => {
      const player = await tx.playerProfile.findFirst({
        where: { id, organizationId: actor.organizationId },
        include: { studentRecord: { select: { studentNumber: true, academicYear: true } } },
      })
      if (!player) throw centerError(404, '球员档案不存在')
      if (player.updatedAt.toISOString() !== new Date(body.expectedUpdatedAt).toISOString())
        throw centerError(409, '球员资料已更新，请刷新')
      const { reason, expectedUpdatedAt, ...data } = body
      if (player.studentRecord)
        data.academicYear =
          academicYearFromNumber(player.studentRecord.studentNumber) ||
          player.studentRecord.academicYear
      const result = await tx.playerProfile.update({
        where: { id, updatedAt: player.updatedAt },
        data,
      })
      await this.command.audit(
        tx,
        actor,
        'CAMPUS_PLAYER_PROFILE_UPDATED',
        'PlayerProfile',
        id,
        reason,
        requestId,
        player,
        result,
      )
      return result
    })
  }

  async uploadMedia(
    auth: string | undefined,
    body: CampusMediaDto,
    key: string | undefined,
    requestId: string,
  ) {
    let uploaded: { organizationId: string; id: string } | undefined
    try {
      return await this.command.write(
        auth,
        `campus:media:${body.targetType}:${body.targetId}:${body.slot}`,
        { ...body, dataUrl: createHash('sha256').update(body.dataUrl).digest('hex') },
        key,
        true,
        async (tx, actor) => {
          if (body.targetType === 'USER' && body.slot === 'PORTRAIT')
            throw centerError(400, '球员照片请在球员资料中维护')
          const user =
            body.targetType === 'USER'
              ? await tx.user.findFirst({
                  where: {
                    id: body.targetId,
                    memberships: { some: { organizationId: actor.organizationId } },
                  },
                  select: { id: true, updatedAt: true },
                })
              : null
          const player =
            body.targetType === 'PLAYER'
              ? await tx.playerProfile.findFirst({
                  where: { id: body.targetId, organizationId: actor.organizationId },
                  select: { id: true, updatedAt: true },
                })
              : null
          const entity = user ?? player
          if (!entity) throw centerError(404, '资料对象不属于当前组织')
          if (user) await this.command.requireUserProfileWrite(tx, actor, user.id)
          if (entity.updatedAt.toISOString() !== new Date(body.expectedUpdatedAt).toISOString())
            throw centerError(409, '资料已更新，请刷新后上传')
          const purpose =
            body.targetType === 'USER'
              ? body.slot === 'AVATAR'
                ? 'USER_AVATAR'
                : 'USER_BACKGROUND'
              : body.slot === 'AVATAR'
                ? 'PLAYER_AVATAR'
                : body.slot === 'COVER'
                  ? 'PLAYER_BACKGROUND'
                  : 'PLAYER_PORTRAIT'
          const saved = await this.media.submitManagedProfile(
            tx,
            actor,
            purpose,
            body.targetId,
            body.dataUrl,
            requestId,
          )
          uploaded = { organizationId: actor.organizationId, id: saved.id }
          const picture = { avatarUrl: saved.url }

          await this.command.audit(
            tx,
            actor,
            'CAMPUS_PROFILE_MEDIA_UPDATED',
            body.targetType,
            body.targetId,
            body.reason,
            requestId,
            null,
            { slot: body.slot, url: picture.avatarUrl },
          )
          return { url: picture.avatarUrl }
        },
      )
    } catch (error) {
      if (uploaded) await this.media.abortManagedProfile(uploaded.organizationId, uploaded.id)
      throw error
    }
  }

  private async versionedStudent(
    tx: CampusTx,
    actor: AuthenticatedSession,
    id: string,
    version: number,
  ) {
    const student = await tx.studentRecord.findFirst({
      where: { id, organizationId: actor.organizationId },
    })
    if (!student) throw centerError(404, '学生档案不存在')
    if (student.version !== version) throw centerError(409, '档案已更新，请刷新')
    return student
  }
}
function mask(value: string | null) {
  return value ? (value.length <= 4 ? '****' : value.slice(0, 2) + '****' + value.slice(-2)) : null
}
