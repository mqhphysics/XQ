import { createHash } from 'node:crypto'
import { ensureStudentPlayer } from '../common/student-player'
import { Inject, Injectable, type HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { isUUID } from 'class-validator'
import { ApiHttpException } from '../common/api-http.exception'
import { AccessPolicyService } from '../auth/access-policy.service'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { PrismaService } from '../database/prisma.service'
import { Prisma } from '../generated/prisma/client'
import { SocialService } from '../social/social.service'
import { assertReporterIdentityEligible } from '../campus/reporter-quality.service'
import { assertCaptainCapacity } from '../roster/captain-limit'
import type {
  IdentityApplicationDto,
  IdentityKind,
  IdentityRecordDto,
  IdentityReviewDto,
  RevokeIdentityRecordDto,
  ConfirmIdentityDto,
  VerifyIdentityUserDto,
} from './identity.dto'

type Tx = Prisma.TransactionClient
type Candidate = {
  id: string
  kind: IdentityKind
  displayName: string
  teamId: string | null
  teamName: string | null
}
const includeApplication = { team: { select: { id: true, name: true } } } as const

@Injectable()
export class IdentityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessPolicyService) private readonly policy: AccessPolicyService,
    @Inject(SocialService) private readonly social: SocialService,
  ) {}

  async myIdentity(authorization: string | undefined) {
    const actor = await this.auth.requireSession(authorization)
    return this.prisma.$transaction(
      async (tx) => {
        await this.fresh(tx, actor, false)
        const user = await tx.user.findUniqueOrThrow({
          where: { id: actor.userId },
          select: { realName: true },
        })
        const name = user.realName?.trim()
        const [players, records, applications, teams] = await Promise.all([
          name
            ? tx.playerProfile.findMany({
                where: {
                  organizationId: actor.organizationId,
                  displayName: { equals: name, mode: 'insensitive' },
                  linkedUser: null,
                },
                select: {
                  id: true,
                  displayName: true,
                  teamMemberships: {
                    where: { status: 'ACTIVE', organizationId: actor.organizationId },
                    select: { team: { select: { id: true, name: true } } },
                    take: 1,
                  },
                },
                orderBy: { id: 'asc' },
                take: 21,
              })
            : Promise.resolve([]),
          name
            ? tx.identityRecord.findMany({
                where: {
                  organizationId: actor.organizationId,
                  displayName: { equals: name, mode: 'insensitive' },
                  status: 'ACTIVE',
                  linkedUserId: null,
                },
                include: { team: { select: { name: true } } },
                orderBy: { id: 'asc' },
                take: 21,
              })
            : Promise.resolve([]),
          tx.identityApplication.findMany({
            where: {
              organizationId: actor.organizationId,
              userId: actor.userId,
              kind: { not: 'STUDENT_REGISTRATION' },
            },
            include: includeApplication,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            take: 100,
          }),
          tx.team.findMany({
            where: { organizationId: actor.organizationId },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
            take: 200,
          }),
        ])
        const candidates: Candidate[] = [
          ...players.map((p) => ({
            id: `player:${p.id}`,
            kind: 'PLAYER' as const,
            displayName: p.displayName,
            teamId: p.teamMemberships[0]?.team.id ?? null,
            teamName: p.teamMemberships[0]?.team.name ?? null,
          })),
          ...records.map((r) => ({
            id: `record:${r.id}`,
            kind: r.kind as IdentityKind,
            displayName: r.displayName,
            teamId: r.teamId,
            teamName: r.team?.name ?? null,
          })),
        ]
        const verifiedRecords = await tx.identityRecord.findMany({
          where: {
            organizationId: actor.organizationId,
            linkedUserId: actor.userId,
            status: 'ACTIVE',
            grantedAssignmentId: null,
          },
          include: { team: { select: { name: true } } },
          orderBy: { id: 'asc' },
          take: 20,
        })
        const confirmed = await this.confirmedRecordIds(
          tx,
          actor.organizationId,
          verifiedRecords.map((record) => record.id),
        )
        return {
          candidates: candidates.slice(0, 20),
          hasMoreCandidates: candidates.length > 20,
          applications,
          teams,
          notice: '姓名仅用于提示可能匹配。申请需管理员核实，确认候选不会获得权限。',
          verifiedCandidates: verifiedRecords
            .filter((record) => !confirmed.has(record.id))
            .map((record) => ({
              id: `record:${record.id}`,
              kind: record.kind,
              displayName: record.displayName,
              teamId: record.teamId,
              teamName: record.team?.name ?? null,
              expectedVersion: record.version,
            })),
        }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }

  async apply(
    authorization: string | undefined,
    body: IdentityApplicationDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command(authorization, 'identity:apply', body, key, false, async (tx, actor) => {
      if (body.kind === 'MATCH_REPORTER')
        await assertReporterIdentityEligible(tx, actor.organizationId, actor.userId)
      const currentUser = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { realName: true, playerProfileId: true },
      })
      let candidate: Candidate | undefined
      if (body.candidateId) {
        candidate = await this.candidate(tx, actor.organizationId, body.candidateId)
        const user = currentUser
        if (!user.realName || normalize(candidate.displayName) !== normalize(user.realName))
          throw fail(400, '该候选不属于当前姓名匹配，请主动提交无匹配申请')
        if (candidate.kind !== body.kind) throw fail(400, '申请身份与候选不一致')
      }
      const teamId = body.teamId?.toLowerCase() ?? candidate?.teamId ?? null
      if (candidate?.teamId && candidate.teamId !== teamId) throw fail(400, '申请球队与候选不一致')
      if (body.kind === 'TEAM_CAPTAIN' || body.kind === 'TEAM_COACH') {
        if (!teamId) throw fail(400, '队长或教练申请必须选择球队')
      }
      if (
        teamId &&
        !(await tx.team.findFirst({
          where: { id: teamId, organizationId: actor.organizationId },
          select: { id: true },
        }))
      )
        throw fail(404, '本组织不存在该球队')
      if (body.kind === 'PLAYER' && currentUser.playerProfileId)
        throw fail(409, '账号已经关联球员档案，请联系管理员修正')
      if (
        await tx.identityApplication.findFirst({
          where: {
            organizationId: actor.organizationId,
            userId: actor.userId,
            status: 'PENDING',
            kind: body.kind,
            teamId,
          },
        })
      )
        throw fail(409, '已有同身份和球队的待审核申请，请等待处理')
      const result = await tx.identityApplication.create({
        data: {
          organizationId: actor.organizationId,
          userId: actor.userId,
          kind: body.kind,
          teamId,
          candidateId: body.candidateId ?? null,
          message: body.message,
        },
        include: includeApplication,
      })
      await this.audit(tx, actor, 'IDENTITY_APPLICATION_CREATED', result.id, requestId, {
        kind: body.kind,
        teamId,
        status: result.status,
      })
      await this.social.notify(
        {
          organizationId: actor.organizationId,
          recipientUserId: actor.userId,
          type: 'REPORT_UPDATED',
          title: '认证申请已收到',
          body: '我们已收到你的身份认证申请，预计48小时内核实并回复。请耐心等待后续消息。',
          linkPath: '/pages/me/index?panel=identity',
          deduplicationKey: `identity-received:${result.id}`,
        },
        tx,
      )
      return result
    })
  }

  async applications(authorization: string | undefined, requestId: string) {
    const actor = await this.auth.requireSession(authorization)
    return this.prisma.$transaction(
      async (tx) => {
        await this.fresh(tx, actor, true)
        await this.audit(
          tx,
          actor,
          'IDENTITY_APPLICATIONS_VIEWED',
          actor.organizationId,
          requestId,
          {},
        )
        const include = {
          ...includeApplication,
          user: { select: { id: true, displayName: true, realName: true } },
        } as const
        const pending = await tx.identityApplication.findMany({
          where: {
            organizationId: actor.organizationId,
            status: 'PENDING',
            kind: { not: 'STUDENT_REGISTRATION' },
          },
          include,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 201,
        })
        const items = pending.slice(0, 200)
        if (items.length < 200)
          items.push(
            ...(await tx.identityApplication.findMany({
              where: {
                organizationId: actor.organizationId,
                status: { not: 'PENDING' },
                kind: { not: 'STUDENT_REGISTRATION' },
              },
              include,
              orderBy: [{ reviewedAt: 'desc' }, { id: 'asc' }],
              take: 200 - items.length,
            })),
          )
        return { items, hasMorePending: pending.length > 200 }
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }

  async confirm(
    authorization: string | undefined,
    body: ConfirmIdentityDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command(authorization, 'identity:confirm', body, key, false, async (tx, actor) => {
      const record = await tx.identityRecord.findFirst({
        where: {
          id: body.recordId,
          organizationId: actor.organizationId,
          status: 'ACTIVE',
          linkedUserId: actor.userId,
          version: body.expectedVersion,
          grantedAssignmentId: null,
        },
      })
      if (!record) throw fail(409, '未找到本账号的待确认核验记录，请重新匹配')
      if ((await this.confirmedRecordIds(tx, actor.organizationId, [record.id])).has(record.id))
        throw fail(409, '该身份已经确认，请刷新身份信息')
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { playerProfileId: true, verificationLevel: true },
      })
      let assignmentId: string | null = null
      if (record.kind === 'PLAYER') {
        if (
          !record.playerProfileId ||
          !(await tx.playerProfile.findFirst({
            where: { id: record.playerProfileId, organizationId: actor.organizationId },
            select: { id: true },
          }))
        )
          throw fail(409, '核验记录中的球员档案不可用')
        if (user.playerProfileId && user.playerProfileId !== record.playerProfileId)
          throw fail(409, '账号已有其他球员档案，不能自动覆盖')
        if (
          await tx.user.findFirst({
            where: { playerProfileId: record.playerProfileId, id: { not: actor.userId } },
            select: { id: true },
          })
        )
          throw fail(409, '该球员档案已经关联其他账号')
        await tx.user.update({
          where: { id: actor.userId },
          data: { playerProfileId: record.playerProfileId, verificationLevel: 'PLAYER_CONFIRMED' },
        })
      } else if (record.kind === 'STUDENT') {
        if (user.verificationLevel === 'UNVERIFIED')
          await tx.user.update({
            where: { id: actor.userId },
            data: { verificationLevel: 'STUDENT_VERIFIED' },
          })
      } else {
        if (
          !['TEAM_CAPTAIN', 'TEAM_COACH', 'MATCH_REPORTER', 'TOURNAMENT_ADMIN'].includes(
            record.kind,
          ) ||
          !['TEAM', 'MATCH', 'TOURNAMENT'].includes(record.scopeType)
        )
          throw fail(409, '核验记录的身份范围无效')
        const object =
          record.scopeType === 'TEAM'
            ? await tx.team.findFirst({
                where: { id: record.scopeId, organizationId: actor.organizationId },
                select: { id: true },
              })
            : record.scopeType === 'MATCH'
              ? await tx.match.findFirst({
                  where: { id: record.scopeId, organizationId: actor.organizationId },
                  select: { id: true },
                })
              : await tx.tournament.findFirst({
                  where: { id: record.scopeId, organizationId: actor.organizationId },
                  select: { id: true },
                })
        if (!object) throw fail(409, '核验记录的授权对象不可用')
        const role = record.kind as
          | 'TEAM_CAPTAIN'
          | 'TEAM_COACH'
          | 'MATCH_REPORTER'
          | 'TOURNAMENT_ADMIN'
        if (role === 'MATCH_REPORTER')
          await assertReporterIdentityEligible(tx, actor.organizationId, actor.userId)
        const scopeType = record.scopeType as 'TEAM' | 'MATCH' | 'TOURNAMENT'
        const existingRecord = await tx.identityRecord.findFirst({
          where: {
            id: { not: record.id },
            organizationId: actor.organizationId,
            linkedUserId: actor.userId,
            kind: role,
            scopeType,
            scopeId: record.scopeId,
            status: 'ACTIVE',
          },
          select: { id: true },
        })
        if (existingRecord) throw fail(409, '账号已有同范围有效任职记录，请先核查并撤销原任职')
        const active = await tx.roleAssignment.findFirst({
          where: {
            organizationId: actor.organizationId,
            userId: actor.userId,
            role,
            scopeType,
            scopeId: record.scopeId,
            revokedAt: null,
          },
          select: { id: true },
        })
        if (active) throw fail(409, '账号已持有该范围任职，请先核查现有授权')
        if (role === 'TEAM_CAPTAIN')
          await assertCaptainCapacity(tx, actor.organizationId, record.scopeId, actor.userId)
        const assignment = await tx.roleAssignment.upsert({
          where: {
            userId_role_scopeType_scopeId: {
              userId: actor.userId,
              role,
              scopeType,
              scopeId: record.scopeId,
            },
          },
          create: {
            organizationId: actor.organizationId,
            userId: actor.userId,
            role,
            scopeType,
            scopeId: record.scopeId,
            grantedByUserId: record.createdByUserId,
          },
          update: {
            revokedAt: null,
            grantedAt: new Date(),
            grantedByUserId: record.createdByUserId,
          },
        })
        assignmentId = assignment.id
        if (user.verificationLevel === 'UNVERIFIED')
          await tx.user.update({
            where: { id: actor.userId },
            data: { verificationLevel: 'STAFF_VERIFIED' },
          })
      }
      const changed = await tx.identityRecord.updateMany({
        where: {
          id: record.id,
          organizationId: actor.organizationId,
          linkedUserId: actor.userId,
          status: 'ACTIVE',
          version: body.expectedVersion,
        },
        data: { status: 'ACTIVE', grantedAssignmentId: assignmentId, version: { increment: 1 } },
      })
      if (changed.count !== 1) throw fail(409, '核验记录已变化，请重新匹配')
      await this.audit(
        tx,
        actor,
        'IDENTITY_SELF_CONFIRMED',
        record.id,
        requestId,
        {
          kind: record.kind,
          scopeType: record.scopeType,
          scopeId: record.scopeId,
          version: record.version + 1,
          verifiedByUserId: record.createdByUserId,
        },
        '本人确认管理员已核验的账号关联',
      )
      await this.social.notify(
        {
          organizationId: actor.organizationId,
          recipientUserId: actor.userId,
          type: 'REPORT_UPDATED',
          title: '身份认证成功',
          body: '恭喜，你的身份认证已完成。可以前往身份管理选择展示身份。',
          linkPath: '/pages/me/index?panel=identity',
          deduplicationKey: `identity-confirmed:${record.id}`,
        },
        tx,
      )
      return { recordId: record.id, kind: record.kind, status: 'CONFIRMED' }
    })
  }

  async records(authorization: string | undefined, requestId: string) {
    const actor = await this.auth.requireSession(authorization)
    this.policy.requireOrganizationAdministrator(actor)
    await this.audit(
      this.prisma,
      actor,
      'IDENTITY_VERIFICATION_DIRECTORY_VIEWED',
      actor.organizationId,
      requestId,
      {},
    )
    const [items, teams, players, tournaments, matches, users] = await Promise.all([
      this.prisma.identityRecord.findMany({
        where: { organizationId: actor.organizationId },
        include: { team: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.team.findMany({
        where: { organizationId: actor.organizationId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 200,
      }),
      this.prisma.playerProfile.findMany({
        where: { organizationId: actor.organizationId },
        select: { id: true, displayName: true },
        orderBy: { displayName: 'asc' },
        take: 500,
      }),
      this.prisma.tournament.findMany({
        where: { organizationId: actor.organizationId },
        select: { id: true, name: true },
        take: 200,
      }),
      this.prisma.match.findMany({
        where: { organizationId: actor.organizationId },
        select: { id: true, matchCode: true },
        take: 500,
      }),
      this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          memberships: { some: { organizationId: actor.organizationId, status: 'ACTIVE' } },
        },
        select: { id: true, displayName: true, realName: true },
        orderBy: { displayName: 'asc' },
        take: 500,
      }),
    ])
    const confirmed = await this.confirmedRecordIds(
      this.prisma,
      actor.organizationId,
      items.filter((item) => item.linkedUserId && !item.grantedAssignmentId).map((item) => item.id),
    )
    return {
      items: items.map((item) => ({
        ...item,
        awaitingConfirmation:
          item.status === 'ACTIVE' &&
          Boolean(item.linkedUserId) &&
          !item.grantedAssignmentId &&
          !confirmed.has(item.id),
      })),
      teams,
      players,
      tournaments,
      matches,
      users,
    }
  }

  async createRecord(
    authorization: string | undefined,
    body: IdentityRecordDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command(
      authorization,
      'identity:record:create',
      body,
      key,
      true,
      async (tx, actor) => {
        if (body.verifiedUserId) {
          if (body.verifiedUserId === actor.userId)
            throw fail(403, '不能核验本人账号，请由另一名管理员核实')
          const verified = await tx.user.findFirst({
            where: {
              id: body.verifiedUserId,
              status: 'ACTIVE',
              memberships: { some: { organizationId: actor.organizationId, status: 'ACTIVE' } },
            },
            select: { id: true, realName: true },
          })
          if (
            !verified ||
            !verified.realName ||
            normalize(verified.realName) !== normalize(body.displayName)
          )
            throw fail(400, '已核验账号必须属于本组织，且实名与名单一致')
        }
        let scopeType = 'ORGANIZATION',
          scopeId = actor.organizationId
        if (body.kind === 'TEAM_CAPTAIN' || body.kind === 'TEAM_COACH') {
          if (!body.teamId || body.scopeId || body.scopeType)
            throw fail(400, '队长和教练必须且只能指定本组织球队')
          if (
            !(await tx.team.findFirst({
              where: { id: body.teamId, organizationId: actor.organizationId },
              select: { id: true },
            }))
          )
            throw fail(404, '本组织不存在该球队')
          scopeType = 'TEAM'
          scopeId = body.teamId.toLowerCase()
        } else if (body.kind === 'MATCH_REPORTER' || body.kind === 'TOURNAMENT_ADMIN') {
          if (body.kind === 'TOURNAMENT_ADMIN' && body.scopeType !== 'TOURNAMENT')
            throw fail(400, '赛事管理员必须绑定具体赛事')
          if (!body.scopeType || !body.scopeId || body.teamId)
            throw fail(400, '信息管理员必须指定比赛或赛事范围')
          const found =
            body.scopeType === 'MATCH'
              ? await tx.match.findFirst({
                  where: { id: body.scopeId, organizationId: actor.organizationId },
                  select: { id: true },
                })
              : await tx.tournament.findFirst({
                  where: { id: body.scopeId, organizationId: actor.organizationId },
                  select: { id: true },
                })
          if (!found) throw fail(404, '本组织不存在该授权对象')
          scopeType = body.scopeType
          scopeId = found.id
        } else if (body.teamId || body.scopeId || body.scopeType)
          throw fail(400, '学生和球员身份不能指定管理权限范围')
        if (body.kind === 'PLAYER') {
          if (
            !body.playerProfileId ||
            !(await tx.playerProfile.findFirst({
              where: { id: body.playerProfileId, organizationId: actor.organizationId },
              select: { id: true },
            }))
          )
            throw fail(400, '球员身份必须选择本组织球员档案')
        } else if (body.playerProfileId)
          throw fail(400, '教练及其他工作人员身份独立于球员档案，请分别认证')
        const result = await tx.identityRecord.create({
          data: {
            organizationId: actor.organizationId,
            displayName: body.displayName,
            kind: body.kind,
            teamId: body.teamId ?? null,
            playerProfileId: body.playerProfileId ?? null,
            scopeType,
            scopeId,
            createdByUserId: actor.userId,
            linkedUserId: body.verifiedUserId ?? null,
            status: 'ACTIVE',
          },
        })
        await this.audit(
          tx,
          actor,
          'IDENTITY_RECORD_CREATED',
          result.id,
          requestId,
          { kind: result.kind, scopeType, scopeId, verifiedUserId: result.linkedUserId },
          body.reason,
        )
        return result
      },
    )
  }

  async review(
    authorization: string | undefined,
    id: string,
    body: IdentityReviewDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command(
      authorization,
      `identity:review:${id}`,
      body,
      key,
      true,
      async (tx, actor) => {
        const application = await tx.identityApplication.findFirst({
          where: { id, organizationId: actor.organizationId },
        })
        if (!application) throw fail(404, '申请不存在')
        if (application.kind === 'STUDENT_REGISTRATION')
          throw fail(400, '注册学号请在注册核验入口处理')
        if (application.userId === actor.userId) throw fail(403, '不能审核自己的认证申请')
        if (application.status !== 'PENDING' || application.version !== body.expectedVersion)
          throw fail(409, '申请已处理或版本变化，请刷新后核对')
        const note = body.note?.trim() || (body.decision === 'APPROVED' ? '管理员批准身份认证' : '')
        if (body.decision === 'REJECTED' && note.length < 2) throw fail(400, '请填写拒绝原因')
        let resolved = body.resolvedCandidateId ?? application.candidateId

        if (
          body.decision === 'APPROVED' &&
          !resolved &&
          ['MATCH_REPORTER', 'TOURNAMENT_ADMIN'].includes(application.kind)
        ) {
          if (
            !body.scopeId ||
            !body.scopeType ||
            (application.kind === 'TOURNAMENT_ADMIN' && body.scopeType !== 'TOURNAMENT')
          )
            throw fail(400, '请选择本次任职的赛事或比赛范围')
          const scope =
            body.scopeType === 'MATCH'
              ? await tx.match.findFirst({
                  where: { id: body.scopeId, organizationId: actor.organizationId },
                  select: { id: true },
                })
              : await tx.tournament.findFirst({
                  where: { id: body.scopeId, organizationId: actor.organizationId },
                  select: { id: true },
                })
          if (!scope) throw fail(404, '授权对象不属于当前组织')
          const person = await tx.user.findUniqueOrThrow({
            where: { id: application.userId },
            select: { realName: true },
          })
          if (!person.realName) throw fail(400, '请先补充申请人姓名')
          const record = await tx.identityRecord.create({
            data: {
              organizationId: actor.organizationId,
              kind: application.kind,
              displayName: person.realName,
              scopeType: body.scopeType,
              scopeId: scope.id,
              createdByUserId: actor.userId,
              status: 'ACTIVE',
            },
          })
          resolved = `record:${record.id}`
        } else if (body.scopeId || body.scopeType) throw fail(400, '已有任职记录的授权范围不能在审批时覆盖')
        // Claim the application before locking the applicant or writing its notification.
        const claimed = await tx.identityApplication.updateMany({
          where: {
            id,
            organizationId: actor.organizationId,
            status: 'PENDING',
            version: body.expectedVersion,
          },
          data: {
            status: body.decision,
            reviewedByUserId: actor.userId,
            reviewedAt: new Date(),
            decisionNote: note,
            resolvedCandidateId: body.decision === 'APPROVED' ? resolved : null,
            version: { increment: 1 },
          },
        })
        if (claimed.count !== 1) throw fail(409, '申请已处理或版本变化，请刷新后核对')
        if (body.decision === 'APPROVED' && !resolved && application.kind === 'PLAYER') {
          const player = await ensureStudentPlayer(
            tx,
            actor.organizationId,
            application.userId,
            actor.userId,
            requestId,
            false,
          )
          const member = application.teamId
            ? await tx.teamMembership.findUnique({
                where: {
                  teamId_userId: { teamId: application.teamId, userId: application.userId },
                },
              })
            : null
          if (member?.playerProfileId && member.playerProfileId !== player.id)
            throw fail(409, '已有球队成员关联其他球员，请核对后再批准')
          const playerMember = application.teamId
            ? await tx.teamMembership.findUnique({
                where: { teamId_playerProfileId: { teamId: application.teamId, playerProfileId: player.id } },
              })
            : null
          if (playerMember?.userId && playerMember.userId !== application.userId)
            throw fail(409, '球队内的球员成员已关联其他账号，不能覆盖')
          if (member && playerMember && member.id !== playerMember.id)
            throw fail(409, '账号与球员分别已有球队成员记录，请先核对')
          if (playerMember)
            await tx.teamMembership.update({
              where: { id: playerMember.id },
              data: { userId: application.userId, status: 'ACTIVE', removedAt: null },
            })
          else if (application.teamId)
            await tx.teamMembership.upsert({
              where: { teamId_userId: { teamId: application.teamId, userId: application.userId } },
              create: {
                organizationId: actor.organizationId,
                teamId: application.teamId,
                userId: application.userId,
                playerProfileId: player.id,
              },
              update: { playerProfileId: player.id, status: 'ACTIVE', removedAt: null },
            })
          resolved = `player:${player.id}`
        }
        if (resolved && !application.candidateId && application.kind === 'PLAYER')
          await tx.identityApplication.update({
            where: { id },
            data: { resolvedCandidateId: resolved },
          })
        const applicant = await tx.user.findFirst({
          where: {
            id: application.userId,
            status: 'ACTIVE',
            memberships: { some: { organizationId: actor.organizationId, status: 'ACTIVE' } },
          },
          select: {
            id: true,
            playerProfileId: true,
            verificationLevel: true,
            studentRecordId: true,
            studentId: true,
          },
        })
        if (!applicant) throw fail(409, '申请人的账号或组织成员身份已失效')
        if (body.decision === 'APPROVED') {
          if (!resolved) throw fail(400, '批准前必须指定核实后的名单记录或球员档案，并填写核实依据')
          const candidate = await this.candidate(tx, actor.organizationId, resolved, applicant.id, application.teamId ?? undefined)
          if (
            candidate.kind !== application.kind ||
            (application.teamId && candidate.teamId !== application.teamId)
          )
            throw fail(400, '核实对象与申请身份或球队不一致')
          const parsed = parseCandidate(resolved)
          const record =
            parsed.type === 'record'
              ? await tx.identityRecord.findUniqueOrThrow({ where: { id: parsed.id } })
              : null
          const playerId = record?.playerProfileId ?? (parsed.type === 'player' ? parsed.id : null)
          if (application.kind === 'PLAYER') {
            if (!playerId) throw fail(400, '球员记录未指定球员档案')
            const player = await tx.playerProfile.findFirst({
              where: { id: playerId, organizationId: actor.organizationId },
              select: { studentRecordId: true },
            })
            if (
              applicant.studentRecordId &&
              player?.studentRecordId &&
              applicant.studentRecordId !== player.studentRecordId
            )
              throw fail(409, '球员档案对应其他学生，不能凭姓名认领，请先核对学号与学生关联')
            if (applicant.playerProfileId && applicant.playerProfileId !== playerId)
              throw fail(409, '申请人已关联其他球员，不能覆盖')
            const claimed = await tx.user.findFirst({
              where: { playerProfileId: playerId, id: { not: applicant.id } },
              select: { id: true },
            })
            if (claimed) throw fail(409, '球员档案已关联其他账号，请人工核查')
            await tx.user.update({
              where: { id: applicant.id },
              data: {
                playerProfileId: playerId,
                verificationLevel:
                  applicant.verificationLevel === 'STAFF_VERIFIED'
                    ? 'STAFF_VERIFIED'
                    : 'PLAYER_CONFIRMED',
                ...(applicant.studentRecordId ? { studentVerifiedAt: new Date() } : {}),
              },
            })
            if (applicant.studentRecordId && !player?.studentRecordId)
              await tx.playerProfile.update({
                where: { id: playerId },
                data: {
                  studentRecordId: applicant.studentRecordId,
                  studentId: applicant.studentId,
                },
              })
          } else if (application.kind === 'STUDENT') {
            if (applicant.studentRecordId) {
              const student = await tx.studentRecord.findFirst({
                where: {
                  id: applicant.studentRecordId,
                  organizationId: actor.organizationId,
                  studentNumber: applicant.studentId,
                },
              })
              if (!student) throw fail(409, '学生档案与账号学号不一致，请先在学生目录核查')
              await tx.studentRecord.update({
                where: { id: student.id },
                data: { status: 'ACTIVE', version: { increment: 1 } },
              })
            }
            await tx.user.update({
              where: { id: applicant.id },
              data: {
                ...(applicant.verificationLevel === 'UNVERIFIED'
                  ? { verificationLevel: 'STUDENT_VERIFIED' as const }
                  : {}),
                ...(applicant.studentRecordId ? { studentVerifiedAt: new Date() } : {}),
              },
            })
          } else {
            if (!record) throw fail(400, '工作人员角色必须关联管理员录入的任职记录')
            const role = record.kind as
              | 'TEAM_CAPTAIN'
              | 'TEAM_COACH'
              | 'MATCH_REPORTER'
              | 'TOURNAMENT_ADMIN'
            if (role === 'MATCH_REPORTER')
              await assertReporterIdentityEligible(tx, actor.organizationId, applicant.id)
            if (
              await tx.identityRecord.findFirst({
                where: {
                  organizationId: actor.organizationId,
                  linkedUserId: applicant.id,
                  kind: role,
                  scopeType: record.scopeType,
                  scopeId: record.scopeId,
                  status: 'ACTIVE',
                  id: { not: record.id },
                },
              })
            )
              throw fail(409, '账号已有同范围有效任职记录，请先核查并撤销原任职')
            if (
              await tx.roleAssignment.findFirst({
                where: {
                  userId: applicant.id,
                  role,
                  scopeType: record.scopeType as 'TEAM' | 'MATCH' | 'TOURNAMENT',
                  scopeId: record.scopeId,
                  revokedAt: null,
                },
              })
            )
              throw fail(409, '该账号已持有该范围任职，请核查现有授权，不能重复关联任职记录')
            if (role === 'TEAM_CAPTAIN')
              await assertCaptainCapacity(tx, actor.organizationId, record.scopeId, applicant.id)
            const assignment = await tx.roleAssignment.upsert({
              where: {
                userId_role_scopeType_scopeId: {
                  userId: applicant.id,
                  role,
                  scopeType: record.scopeType as 'TEAM' | 'MATCH' | 'TOURNAMENT',
                  scopeId: record.scopeId,
                },
              },
              create: {
                organizationId: actor.organizationId,
                userId: applicant.id,
                role,
                scopeType: record.scopeType as 'TEAM' | 'MATCH' | 'TOURNAMENT',
                scopeId: record.scopeId,
                grantedByUserId: actor.userId,
              },
              update: { revokedAt: null, grantedAt: new Date(), grantedByUserId: actor.userId },
            })
            await tx.identityRecord.update({
              where: { id: record.id },
              data: { grantedAssignmentId: assignment.id },
            })
            if (applicant.verificationLevel === 'UNVERIFIED')
              await tx.user.update({
                where: { id: applicant.id },
                data: { verificationLevel: 'STAFF_VERIFIED' },
              })
          }
          if (record)
            await tx.identityRecord.update({
              where: { id: record.id },
              data: { linkedUserId: applicant.id, version: { increment: 1 } },
            })
        }
        const result = await tx.identityApplication.findUniqueOrThrow({
          where: { id },
          include: includeApplication,
        })
        await this.audit(
          tx,
          actor,
          `IDENTITY_APPLICATION_${body.decision}`,
          id,
          requestId,
          {
            userId: applicant.id,
            kind: application.kind,
            status: result.status,
            resolvedCandidateId: result.resolvedCandidateId,
            version: result.version,
          },
          note,
        )
        await this.social.notify(
          {
            organizationId: actor.organizationId,
            recipientUserId: applicant.id,
            type: 'REPORT_UPDATED',
            title: body.decision === 'APPROVED' ? '身份认证成功' : '认证申请处理结果',
            body:
              body.decision === 'APPROVED'
                ? '你的身份认证已完成，可在个人中心查看授权范围。'
                : `你的认证申请暂未通过：${note}`,
            linkPath: '/pages/me/index?panel=identity',
            deduplicationKey: `identity-reviewed:${id}:${result.version}`,
          },
          tx,
        )
        return result
      },
    )
  }

  async verifyUser(
    authorization: string | undefined,
    id: string,
    body: VerifyIdentityUserDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command(
      authorization,
      `identity:record:verify-user:${id}`,
      body,
      key,
      true,
      async (tx, actor) => {
        if (body.verifiedUserId === actor.userId)
          throw fail(403, '不能核验本人账号，请由另一名管理员核实')
        const record = await tx.identityRecord.findFirst({
          where: {
            id,
            organizationId: actor.organizationId,
            status: 'ACTIVE',
            linkedUserId: null,
            version: body.expectedVersion,
          },
        })
        if (!record) throw fail(409, '记录已关联或发生变化，请刷新名册')
        const user = await tx.user.findFirst({
          where: {
            id: body.verifiedUserId,
            status: 'ACTIVE',
            memberships: { some: { organizationId: actor.organizationId, status: 'ACTIVE' } },
          },
          select: { id: true, realName: true },
        })
        if (!user?.realName || normalize(user.realName) !== normalize(record.displayName))
          throw fail(400, '核验账号必须属于本组织，且实名与名单一致')
        const changed = await tx.identityRecord.updateMany({
          where: {
            id,
            organizationId: actor.organizationId,
            status: 'ACTIVE',
            linkedUserId: null,
            version: body.expectedVersion,
          },
          data: { linkedUserId: user.id, version: { increment: 1 } },
        })
        if (changed.count !== 1) throw fail(409, '记录已变化，请刷新后核验')
        const updated = await tx.identityRecord.findUniqueOrThrow({ where: { id } })
        await this.audit(
          tx,
          actor,
          'IDENTITY_ACCOUNT_VERIFIED',
          id,
          requestId,
          { verifiedUserId: user.id, kind: record.kind, version: updated.version },
          body.reason,
        )
        return updated
      },
    )
  }
  async revokeRecord(
    authorization: string | undefined,
    id: string,
    body: RevokeIdentityRecordDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command(
      authorization,
      `identity:record:revoke:${id}`,
      body,
      key,
      true,
      async (tx, actor) => {
        const record = await tx.identityRecord.findFirst({
          where: { id, organizationId: actor.organizationId },
        })
        if (!record) throw fail(404, '任职记录不存在')
        if (record.status !== 'ACTIVE' || record.version !== body.expectedVersion)
          throw fail(409, '任职记录已变化，请刷新')
        if (record.grantedAssignmentId)
          await tx.roleAssignment.updateMany({
            where: {
              id: record.grantedAssignmentId,
              organizationId: actor.organizationId,
              userId: record.linkedUserId ?? '',
              role: record.kind as
                | 'TEAM_COACH'
                | 'TEAM_CAPTAIN'
                | 'MATCH_REPORTER'
                | 'TOURNAMENT_ADMIN',
              scopeId: record.scopeId,
            },
            data: { revokedAt: new Date() },
          })
        const result = await tx.identityRecord.update({
          where: { id },
          data: { status: 'REVOKED', version: { increment: 1 } },
        })
        await this.audit(
          tx,
          actor,
          'IDENTITY_RECORD_REVOKED',
          id,
          requestId,
          { kind: record.kind, linkedUserId: record.linkedUserId, version: result.version },
          body.reason,
        )
        return result
      },
    )
  }

  private async confirmedRecordIds(tx: Tx, organizationId: string, ids: string[]) {
    if (!ids.length) return new Set<string>()
    const [audits, applications] = await Promise.all([
      tx.auditLog.findMany({
        where: {
          organizationId,
          action: 'IDENTITY_SELF_CONFIRMED',
          targetType: 'Identity',
          targetId: { in: ids },
        },
        select: { targetId: true },
      }),
      tx.identityApplication.findMany({
        where: {
          organizationId,
          status: 'APPROVED',
          resolvedCandidateId: { in: ids.map((id) => `record:${id}`) },
        },
        select: { resolvedCandidateId: true },
      }),
    ])
    return new Set([
      ...audits.map((item) => item.targetId),
      ...applications.flatMap((item) =>
        item.resolvedCandidateId ? [item.resolvedCandidateId.replace(/^record:/, '')] : [],
      ),
    ])
  }
  private async candidate(
    tx: Tx,
    organizationId: string,
    value: string,
    applicantId?: string,
    teamId?: string,
  ): Promise<Candidate> {
    const parsed = parseCandidate(value)
    if (parsed.type === 'player') {
      const player = await tx.playerProfile.findFirst({
        where: {
          id: parsed.id,
          organizationId,
          OR: [{ linkedUser: null }, ...(applicantId ? [{ linkedUser: { id: applicantId } }] : [])],
        },
        select: {
          id: true,
          displayName: true,
          teamMemberships: {
            where: { organizationId, status: 'ACTIVE', ...(teamId ? { teamId } : {}) },
            select: { team: { select: { id: true, name: true } } },
            take: 1,
          },
        },
      })
      if (!player) throw fail(409, '候选已关联、撤销或不存在，请刷新后核查')
      return {
        id: value,
        kind: 'PLAYER',
        displayName: player.displayName,
        teamId: player.teamMemberships[0]?.team.id ?? null,
        teamName: player.teamMemberships[0]?.team.name ?? null,
      }
    }
    const record = await tx.identityRecord.findFirst({
      where: {
        id: parsed.id,
        organizationId,
        status: 'ACTIVE',
        OR: [{ linkedUserId: null }, ...(applicantId ? [{ linkedUserId: applicantId }] : [])],
      },
      include: { team: { select: { name: true } } },
    })
    if (!record) throw fail(409, '候选已关联、撤销或不存在，请刷新后核查')
    return {
      id: value,
      kind: record.kind as IdentityKind,
      displayName: record.displayName,
      teamId: record.teamId,
      teamName: record.team?.name ?? null,
    }
  }

  private async fresh(tx: Tx, actor: AuthenticatedSession, admin: boolean) {
    const session = await tx.userSession.findFirst({
      where: {
        id: actor.sessionId,
        userId: actor.userId,
        organizationId: actor.organizationId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          status: 'ACTIVE',
          memberships: { some: { organizationId: actor.organizationId, status: 'ACTIVE' } },
        },
        organization: { status: 'ACTIVE' },
      },
      select: { id: true },
    })
    if (!session) throw fail(401, '登录或组织身份已失效')
    const roles = await tx.roleAssignment.findMany({
      where: {
        userId: actor.userId,
        revokedAt: null,
        grantedAt: { lte: new Date() },
        OR: [
          { organizationId: actor.organizationId },
          { organizationId: null, role: 'PLATFORM_ADMIN', scopeType: 'PLATFORM' },
        ],
      },
      select: { role: true, scopeType: true, scopeId: true },
    })
    const fresh = { ...actor, user: { ...actor.user, roles } }
    if (admin) this.policy.requireOrganizationAdministrator(fresh)
    return fresh
  }

  private async command<T>(
    authorization: string | undefined,
    route: string,
    body: unknown,
    key: string | undefined,
    admin: boolean,
    run: (tx: Tx, actor: AuthenticatedSession) => Promise<T>,
  ): Promise<T> {
    const actor = await this.auth.requireSession(authorization)
    if (!key || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
      throw fail(400, '请提供8–128字符的 Idempotency-Key')
    const hash = createHash('sha256')
      .update(JSON.stringify({ organizationId: actor.organizationId, body }))
      .digest('hex')
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const fresh = await this.fresh(tx, actor, admin)
            const prior = await tx.idempotencyRecord.findUnique({
              where: {
                userId_route_idempotencyKey: { userId: actor.userId, route, idempotencyKey: key },
              },
            })
            if (prior) {
              if (prior.organizationId !== actor.organizationId || prior.requestHash !== hash)
                throw fail(409, '幂等键不能用于不同请求')
              return prior.responseBody as T
            }
            const result = await run(tx, fresh)
            await tx.idempotencyRecord.create({
              data: {
                organizationId: actor.organizationId,
                userId: actor.userId,
                route,
                idempotencyKey: key,
                requestHash: hash,
                responseBody: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
                responseStatus: 200,
                expiresAt: new Date(Date.now() + 7 * 86400000),
              },
            })
            return result
          },
          { isolationLevel: 'Serializable', timeout: 15000 },
        )
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code)
        ) {
          if (attempt < 2) continue
          throw fail(409, '申请、角色或关联已存在或正在处理，请刷新后重试')
        }
        throw error
      }
    }
    throw fail(409, '并发变更，请重试')
  }

  private audit(
    tx: Tx,
    actor: AuthenticatedSession,
    action: string,
    targetId: string,
    requestId: string,
    after: Prisma.InputJsonObject,
    reason?: string,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorType: 'USER',
        actorUserId: actor.userId,
        actorRoleSnapshot: actor.user.roles.map(({ role, scopeType, scopeId }) => ({
          role,
          scopeType,
          scopeId,
        })),
        action,
        targetType: 'Identity',
        targetId,
        afterSummary: after,
        reason: reason ?? null,
        requestId,
        source: 'API',
      },
    })
  }
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('zh-CN')
}
function parseCandidate(value: string) {
  const [type, id, extra] = value.split(':')
  if ((type !== 'player' && type !== 'record') || !id || extra || !isUUID(id))
    throw fail(400, '候选编号无效')
  return { type, id: id.toLowerCase() }
}
function fail(status: number, message: string) {
  const code =
    status === 400
      ? ERROR_CODES.BAD_REQUEST
      : status === 401
        ? ERROR_CODES.UNAUTHORIZED
        : status === 403
          ? ERROR_CODES.FORBIDDEN
          : status === 404
            ? ERROR_CODES.NOT_FOUND
            : ERROR_CODES.CONFLICT
  return new ApiHttpException(status as HttpStatus, { code, message })
}
