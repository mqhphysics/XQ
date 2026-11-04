import { Inject, Injectable } from '@nestjs/common'
import { centerError } from '../admin-center/admin-center.policy'
import { CampusCommandService, type CampusTx } from './campus-command.service'
import type { AuthenticatedSession } from '../auth/auth.service'
import {
  REPORTER_RULES,
  completedReinstatement,
  confirmedError,
  qualifiedMatch,
} from './reporter-quality.rules'
import type {
  ReporterAppealDto,
  ReporterCaseDto,
  ReporterReviewDto,
  ReporterReinstatementDto,
  ReporterReinstateReviewDto,
} from './campus.dto'

export async function ensureReporterProfile(tx: CampusTx, organizationId: string, userId: string) {
  const existing = await tx.reporterProfile.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  })
  if (existing) return existing
  const role = await tx.roleAssignment.findFirst({
    where: {
      userId,
      organizationId,
      role: 'MATCH_REPORTER',
      revokedAt: null,
      grantedAt: { lte: new Date() },
    },
    orderBy: { grantedAt: 'asc' },
  })
  if (!role) return null
  const profile = await tx.reporterProfile.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    create: { organizationId, userId, activitySince: role.grantedAt },
    update: {},
  })
  await tx.reporterScoreEntry.upsert({
    where: {
      organizationId_deduplicationKey: {
        organizationId,
        deduplicationKey: `initial:${profile.id}`,
      },
    },
    create: {
      organizationId,
      profileId: profile.id,
      deduplicationKey: `initial:${profile.id}`,
      kind: 'INITIAL',
      delta: 0,
      scoreBefore: 100,
      scoreAfter: 100,
      reason: '获得信息员身份，初始记录质量分100',
    },
    update: {},
  })
  return profile
}

export async function refreshReporterState(
  tx: CampusTx,
  profile: NonNullable<Awaited<ReturnType<typeof ensureReporterProfile>>>,
) {
  let current = profile
  const todayUtc = new Date(new Date().toISOString().slice(0, 10))
  if (
    current.status === 'COOLDOWN' &&
    current.cooldownUntil &&
    current.cooldownUntil <= new Date()
  ) {
    const restoredAt = current.cooldownUntil
    const change = completedReinstatement(current)
    const nextSeason = await tx.season.findFirst({
      where: {
        organizationId: current.organizationId,
        isDemo: false,
        startsOn: { gte: restoredAt },
        endsOn: { not: null },
      },
      orderBy: { startsOn: 'asc' },
      select: { endsOn: true },
    })
    const probationUntil = new Date(
      Math.max(
        restoredAt.getTime() + 90 * 86400000,
        nextSeason?.endsOn ? nextSeason.endsOn.getTime() + 86400000 : 0,
      ),
    )
    current = await tx.reporterProfile.update({
      where: { id: current.id, version: current.version },
      data: {
        score: change.score,
        status: change.status,
        reinstatementCount: change.reinstatementCount,
        consecutiveQualified: 0,
        freezeReason: null,
        cooldownUntil: null,
        activitySince: restoredAt,
        probationStartedAt: restoredAt,
        probationUntil,
        probationCompletedAt: null,
        version: { increment: 1 },
      },
    })
    await tx.reporterScoreEntry.create({
      data: {
        organizationId: current.organizationId,
        profileId: current.id,
        deduplicationKey: `reinstate:${current.id}:${current.reinstatementCount}`,
        kind: 'REINSTATEMENT',
        delta: change.delta,
        scoreBefore: profile.score,
        scoreAfter: current.score,
        reason: '复核及冷却期完成，恢复信息员身份；此后的确认差错每次扣20分',
      },
    })
  }
  if (
    current.status === 'PROBATION' &&
    current.probationStartedAt &&
    current.probationUntil &&
    current.probationUntil < new Date() &&
    current.score >= 60
  ) {
    const completed = await tx.season.findFirst({
      where: {
        organizationId: current.organizationId,
        isDemo: false,
        startsOn: { gte: current.probationStartedAt },
        endsOn: { lt: todayUtc },
      },
      orderBy: { endsOn: 'asc' },
      select: { endsOn: true },
    })
    if (completed?.endsOn)
      current = await tx.reporterProfile.update({
        where: { id: current.id, version: current.version },
        data: {
          status: 'ACTIVE',
          probationCompletedAt: new Date(
            Math.max(current.probationUntil.getTime(), completed.endsOn.getTime() + 86400000),
          ),
          version: { increment: 1 },
        },
      })
  }
  if (['ACTIVE', 'PROBATION'].includes(current.status)) {
    const seasons = await tx.season.findMany({
      where: {
        organizationId: current.organizationId,
        startsOn: { gte: current.activitySince },
        endsOn: { lt: todayUtc },
      },
      orderBy: { endsOn: 'desc' },
      take: 20,
    })
    for (const season of seasons) {
      const contributed = await tx.reporterContribution.findFirst({
        where: { profileId: current.id, seasonId: season.id, qualified: true },
        select: { id: true },
      })
      if (!contributed) {
        current = await tx.reporterProfile.update({
          where: { id: current.id, version: current.version },
          data: {
            status: 'FROZEN',
            freezeReason: 'INACTIVE_SEASON',
            consecutiveQualified: 0,
            version: { increment: 1 },
          },
        })
        await tx.reporterScoreEntry.create({
          data: {
            organizationId: current.organizationId,
            profileId: current.id,
            deduplicationKey: `inactive:${current.id}:${season.id}`,
            kind: 'FREEZE',
            delta: 0,
            scoreBefore: current.score,
            scoreAfter: current.score,
            reason: `${season.name}完整赛季无合格记录，冻结信息员身份`,
          },
        })
        break
      }
    }
  }
  return current
}

export async function requireActiveReporter(tx: CampusTx, organizationId: string, userId: string) {
  const candidate = await ensureReporterProfile(tx, organizationId, userId)
  if (!candidate) return
  const profile = await refreshReporterState(tx, candidate)
  if (!['ACTIVE', 'PROBATION'].includes(profile.status))
    throw centerError(
      403,
      profile.status === 'BANNED'
        ? '信息员资格已封禁，不能再次申请'
        : '信息员身份已冻结，请先在我的身份中申请恢复',
    )
}

export async function assertReporterIdentityEligible(
  tx: CampusTx,
  organizationId: string,
  userId: string,
) {
  const profile = await tx.reporterProfile.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  })
  if (profile && ['BANNED', 'FROZEN', 'COOLDOWN'].includes(profile.status))
    throw centerError(
      403,
      profile.status === 'BANNED'
        ? '信息员资格已封禁，不能再次申请'
        : '已有冻结的信息员身份，请通过复训申请恢复，不能重复申请绕过冻结',
    )
}

export async function acceptReporterContribution(
  tx: CampusTx,
  organizationId: string,
  userId: string,
  matchId: string,
  reportRevisionId: string,
) {
  const candidate = await ensureReporterProfile(tx, organizationId, userId)
  if (!candidate) return
  const profile = await refreshReporterState(tx, candidate)
  if (!['ACTIVE', 'PROBATION'].includes(profile.status)) return
  const existing = await tx.reporterContribution.findUnique({
    where: { profileId_matchId: { profileId: profile.id, matchId } },
  })
  if (existing) return
  const match = await tx.match.findFirst({
    where: { id: matchId, organizationId },
    include: { tournament: { select: { seasonId: true } } },
  })
  if (!match) throw centerError(404, '比赛不存在')
  await tx.reporterContribution.create({
    data: {
      organizationId,
      profileId: profile.id,
      matchId,
      reportRevisionId,
      seasonId: match.tournament.seasonId,
    },
  })
  const change = qualifiedMatch(profile)
  await tx.reporterProfile.update({
    where: { id: profile.id, version: profile.version },
    data: {
      score: change.score,
      consecutiveQualified: change.consecutiveQualified,
      lastContributionAt: new Date(),
      version: { increment: 1 },
    },
  })
  await tx.reporterScoreEntry.create({
    data: {
      organizationId,
      profileId: profile.id,
      deduplicationKey: `contribution:${profile.id}:${matchId}`,
      kind: change.rewarded ? 'REWARD' : 'QUALIFIED_MATCH',
      delta: change.delta,
      scoreBefore: profile.score,
      scoreAfter: change.score,
      reason: change.rewarded
        ? '连续三场记录通过审核，质量分加10（最高100）'
        : '本场记录通过审核，计入三场合格记录',
    },
  })
}

@Injectable()
export class ReporterQualityService {
  constructor(@Inject(CampusCommandService) readonly command: CampusCommandService) {}

  me(auth: string | undefined) {
    return this.command.read(auth, false, async (tx, actor) => {
      const candidate = await ensureReporterProfile(tx, actor.organizationId, actor.userId)
      if (!candidate)
        return { profile: null, rules: REPORTER_RULES, entries: [], cases: [], applications: [] }
      const profile = await refreshReporterState(tx, candidate)
      const [entries, cases, applications] = await Promise.all([
        tx.reporterScoreEntry.findMany({
          where: { profileId: profile.id, organizationId: actor.organizationId },
          orderBy: { createdAt: 'desc' },
          take: 60,
        }),
        tx.reporterCorrectionCase.findMany({
          where: { profileId: profile.id, organizationId: actor.organizationId },
          orderBy: { createdAt: 'desc' },
          take: 60,
        }),
        tx.reporterReinstatement.findMany({
          where: { profileId: profile.id, organizationId: actor.organizationId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ])
      return { profile, rules: REPORTER_RULES, entries, cases, applications }
    })
  }

  list(auth: string | undefined) {
    return this.command.read(auth, true, async (tx, actor) => {
      const roles = await tx.roleAssignment.findMany({
        where: { organizationId: actor.organizationId, role: 'MATCH_REPORTER', revokedAt: null },
        select: { userId: true },
      })
      for (const role of roles) await ensureReporterProfile(tx, actor.organizationId, role.userId)
      const profiles = await tx.reporterProfile.findMany({
        where: { organizationId: actor.organizationId },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              realName: true,
              studentRecord: { select: { realName: true, studentNumber: true } },
            },
          },
        },
        orderBy: { score: 'asc' },
        take: 200,
      })
      const current = []
      for (const profile of profiles)
        current.push({ ...(await refreshReporterState(tx, profile)), user: profile.user })
      const [cases, applications] = await Promise.all([
        tx.reporterCorrectionCase.findMany({
          where: { organizationId: actor.organizationId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        tx.reporterReinstatement.findMany({
          where: { organizationId: actor.organizationId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ])
      const [matches, revisions] = await Promise.all([
        tx.match.findMany({
          where: {
            organizationId: actor.organizationId,
            id: { in: cases.map((item) => item.matchId) },
          },
          select: { id: true, title: true },
        }),
        tx.matchReportRevision.findMany({
          where: {
            organizationId: actor.organizationId,
            id: { in: cases.map((item) => item.reportRevisionId) },
          },
          select: { id: true, version: true },
        }),
      ])
      return {
        profiles: current,
        cases: cases.map((item) => ({
          ...item,
          matchTitle: matches.find((match) => match.id === item.matchId)?.title ?? '比赛记录',
          reportVersion:
            revisions.find((revision) => revision.id === item.reportRevisionId)?.version ?? null,
        })),
        applications,
        rules: REPORTER_RULES,
      }
    })
  }

  context(auth: string | undefined, matchId: string) {
    return this.command.read(auth, false, async (tx, actor) => {
      const match = await tx.match.findFirst({
        where: { id: matchId, organizationId: actor.organizationId },
        select: { id: true, title: true },
      })
      if (!match) throw centerError(404, '比赛不存在')
      const submissions = await tx.matchReportRevision.findMany({
        where: {
          matchId,
          organizationId: actor.organizationId,
          action: { in: ['SUBMIT', 'SAVE_SCORE'] },
        },
        orderBy: { version: 'desc' },
        take: 30,
      })
      const people = await tx.reporterProfile.findMany({
        where: {
          organizationId: actor.organizationId,
          userId: { in: submissions.map((r) => r.createdByUserId) },
        },
        include: { user: { select: { displayName: true } } },
      })
      return {
        match,
        records: submissions
          .filter((r) => people.some((p) => p.userId === r.createdByUserId))
          .map((r) => ({
            id: r.id,
            version: r.version,
            createdAt: r.createdAt,
            reporterName: people.find((p) => p.userId === r.createdByUserId)?.user.displayName,
          })),
      }
    })
  }

  createCase(
    auth: string | undefined,
    matchId: string,
    body: ReporterCaseDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(
      auth,
      `quality:case:${matchId}`,
      body,
      key,
      false,
      async (tx, actor) => {
        const revision = await tx.matchReportRevision.findFirst({
          where: { id: body.reportRevisionId, matchId, organizationId: actor.organizationId },
        })
        if (!revision) throw centerError(404, '报告版本不存在')
        const profile = await ensureReporterProfile(
          tx,
          actor.organizationId,
          revision.createdByUserId,
        )
        if (!profile) throw centerError(400, '该报告没有可核实的信息员记录')
        const duplicate = await tx.reporterCorrectionCase.findUnique({
          where: {
            organizationId_reportRevisionId_errorKey: {
              organizationId: actor.organizationId,
              reportRevisionId: revision.id,
              errorKey: body.errorKey,
            },
          },
        })
        if (duplicate) return { id: duplicate.id, status: duplicate.status, merged: true }
        const record = await tx.reporterCorrectionCase.create({
          data: {
            organizationId: actor.organizationId,
            profileId: profile.id,
            matchId,
            reportRevisionId: revision.id,
            errorKey: body.errorKey,
            reportedByUserId: actor.userId,
            description: body.description,
            evidence: body.evidence ?? [],
          },
        })
        await this.command.audit(
          tx,
          actor,
          'REPORTER_CORRECTION_REPORTED',
          'ReporterCorrectionCase',
          record.id,
          body.description,
          requestId,
          null,
          { matchId, profileId: profile.id, errorKey: body.errorKey },
        )
        return { id: record.id, status: record.status, merged: false }
      },
    )
  }

  review(
    auth: string | undefined,
    id: string,
    body: ReporterReviewDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(auth, `quality:review:${id}`, body, key, true, async (tx, actor) => {
      const record = await tx.reporterCorrectionCase.findFirst({
        where: { id, organizationId: actor.organizationId },
        include: { profile: true },
      })
      if (!record) throw centerError(404, '纠错事项不存在')
      if (record.version !== body.expectedVersion) throw centerError(409, '纠错事项已更新，请刷新')
      if (record.profile.userId === actor.userId)
        throw centerError(403, '不能审核针对本人的纠错事项')
      let profile = await refreshReporterState(tx, record.profile)
      const scoreBefore = profile.score
      if (body.decision === 'CONFIRMED') {
        if (record.status !== 'OPEN') throw centerError(409, '该事项已裁定，不能重复扣分')
        const revision = await tx.matchReportRevision.findUnique({
          where: { id: record.reportRevisionId },
          select: { version: true },
        })
        const match = await tx.match.findFirst({
          where: { id: record.matchId, organizationId: actor.organizationId },
          select: { confirmedReportVersion: true },
        })
        if (!revision || !match || (match.confirmedReportVersion ?? 0) < revision.version)
          throw centerError(409, '该版本尚未终审发布，先核对比赛记录，草稿修订不扣分')
        const original = await tx.matchReportRevision.findUnique({
          where: { id: record.reportRevisionId },
          select: { createdAt: true },
        })
        const change = confirmedError(profile, original?.createdAt ?? new Date())
        profile = await tx.reporterProfile.update({
          where: { id: profile.id, version: profile.version },
          data: {
            score: change.score,
            status: change.status,
            consecutiveQualified: 0,
            freezeReason:
              change.status === 'FROZEN'
                ? 'LOW_SCORE'
                : change.status === 'BANNED'
                  ? 'ZERO_SCORE'
                  : profile.freezeReason,
            version: { increment: 1 },
          },
        })
        await tx.reporterContribution.updateMany({
          where: { profileId: profile.id, matchId: record.matchId },
          data: { qualified: false },
        })
        await tx.reporterScoreEntry.create({
          data: {
            organizationId: actor.organizationId,
            profileId: profile.id,
            deduplicationKey: `case:${id}:penalty`,
            caseId: id,
            kind: 'PENALTY',
            delta: change.delta,
            scoreBefore,
            scoreAfter: profile.score,
            actorUserId: actor.userId,
            reason: body.reason,
          },
        })
      } else if (body.decision === 'OVERTURNED') {
        if (record.status !== 'CONFIRMED' || !record.appeal)
          throw centerError(409, '仅可撤销已有申诉的确认差错')
        const penalty = await tx.reporterScoreEntry.findUnique({
          where: {
            organizationId_deduplicationKey: {
              organizationId: actor.organizationId,
              deduplicationKey: `case:${id}:penalty`,
            },
          },
        })
        if (!penalty) throw centerError(409, '原扣分记录不存在')
        const score = Math.min(100, profile.score - penalty.delta)
        profile = await tx.reporterProfile.update({
          where: { id: profile.id, version: profile.version },
          data: {
            score,
            status: score >= 60 ? 'ACTIVE' : 'FROZEN',
            freezeReason: score >= 60 ? null : 'LOW_SCORE',
            version: { increment: 1 },
          },
        })
        await tx.reporterScoreEntry.create({
          data: {
            organizationId: actor.organizationId,
            profileId: profile.id,
            deduplicationKey: `case:${id}:reversal`,
            caseId: id,
            kind: 'APPEAL_REVERSAL',
            delta: profile.score - scoreBefore,
            scoreBefore,
            scoreAfter: profile.score,
            actorUserId: actor.userId,
            reason: body.reason,
          },
        })
      } else if (record.status !== 'OPEN') throw centerError(409, '该事项已裁定')
      const updated = await tx.reporterCorrectionCase.update({
        where: { id, version: record.version },
        data: {
          status: body.decision,
          reviewNote: body.reason,
          reviewedByUserId: actor.userId,
          reviewedAt: new Date(),
          version: { increment: 1 },
        },
      })
      await this.command.audit(
        tx,
        actor,
        'REPORTER_CORRECTION_REVIEWED',
        'ReporterCorrectionCase',
        id,
        body.reason,
        requestId,
        { status: record.status, score: scoreBefore },
        { status: updated.status, score: profile.score },
      )
      return { case: updated, profile }
    })
  }

  appeal(
    auth: string | undefined,
    id: string,
    body: ReporterAppealDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(auth, `quality:appeal:${id}`, body, key, false, async (tx, actor) => {
      const record = await tx.reporterCorrectionCase.findFirst({
        where: { id, organizationId: actor.organizationId, profile: { userId: actor.userId } },
      })
      if (!record) throw centerError(404, '纠错事项不存在')
      if (
        record.status !== 'CONFIRMED' ||
        record.appeal ||
        record.version !== body.expectedVersion ||
        !record.reviewedAt ||
        Date.now() - record.reviewedAt.getTime() > 7 * 86400000
      )
        throw centerError(409, '该事项不在可申诉状态或七日申诉期已结束')
      const updated = await tx.reporterCorrectionCase.update({
        where: { id, version: record.version },
        data: { appeal: body.reason, appealedAt: new Date(), version: { increment: 1 } },
      })
      await this.command.audit(
        tx,
        actor,
        'REPORTER_CORRECTION_APPEALED',
        'ReporterCorrectionCase',
        id,
        body.reason,
        requestId,
        null,
        { appeal: true },
      )
      return updated
    })
  }

  applyReinstatement(
    auth: string | undefined,
    body: ReporterReinstatementDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(
      auth,
      'quality:reinstatement',
      body,
      key,
      false,
      async (tx, actor) => {
        const profile = await tx.reporterProfile.findUnique({
          where: {
            organizationId_userId: { organizationId: actor.organizationId, userId: actor.userId },
          },
        })
        if (!profile || profile.status !== 'FROZEN')
          throw centerError(
            403,
            profile?.status === 'BANNED'
              ? '信息员资格已封禁，不能再次申请'
              : '当前信息员身份无需申请解冻',
          )
        const pending = await tx.reporterReinstatement.findFirst({
          where: { profileId: profile.id, status: 'SUBMITTED' },
        })
        if (pending) throw centerError(409, '已有待处理的解冻申请')
        const application = await tx.reporterReinstatement.create({
          data: {
            organizationId: actor.organizationId,
            profileId: profile.id,
            reason: body.reason,
          },
        })
        await this.command.audit(
          tx,
          actor,
          'REPORTER_REINSTATEMENT_REQUESTED',
          'ReporterReinstatement',
          application.id,
          body.reason,
          requestId,
          null,
          { profileId: profile.id },
        )
        return application
      },
    )
  }

  reviewReinstatement(
    auth: string | undefined,
    id: string,
    body: ReporterReinstateReviewDto,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command.write(
      auth,
      `quality:reinstate-review:${id}`,
      body,
      key,
      true,
      async (tx, actor) => {
        const application = await tx.reporterReinstatement.findFirst({
          where: { id, organizationId: actor.organizationId },
          include: { profile: true },
        })
        if (!application) throw centerError(404, '申请不存在')
        if (
          application.version !== body.expectedVersion ||
          application.status !== 'SUBMITTED' ||
          application.profile.status !== 'FROZEN'
        )
          throw centerError(409, '申请或身份状态已变化')
        if (application.profile.userId === actor.userId)
          throw centerError(403, '不能审核本人的解冻申请')
        const cooldownUntil =
          body.decision === 'APPROVED' ? new Date(Date.now() + 7 * 86400000) : null
        const updated = await tx.reporterReinstatement.update({
          where: { id, version: application.version },
          data: {
            status: body.decision,
            reviewNote: body.reason,
            reviewedByUserId: actor.userId,
            cooldownUntil,
            version: { increment: 1 },
          },
        })
        if (cooldownUntil)
          await tx.reporterProfile.update({
            where: { id: application.profile.id, version: application.profile.version },
            data: { status: 'COOLDOWN', cooldownUntil, version: { increment: 1 } },
          })
        await this.command.audit(
          tx,
          actor,
          'REPORTER_REINSTATEMENT_REVIEWED',
          'ReporterReinstatement',
          id,
          body.reason,
          requestId,
          { status: application.status },
          { status: updated.status, cooldownUntil },
        )
        return updated
      },
    )
  }
}
