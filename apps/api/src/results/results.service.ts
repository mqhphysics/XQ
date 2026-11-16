import { createHash, randomUUID } from 'node:crypto'

import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { AccessPolicyService } from '../auth/access-policy.service'
import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { selectPublicTournament } from '../common/public-tournament'
import { PrismaService } from '../database/prisma.service'
import { type Prisma } from '../generated/prisma/client'
import {
  CompetitionRuleError,
  requireRule,
  resolveScore,
  type ResultFact,
} from './competition-rules'
import { confirmedResultFact } from './confirmed-result'
import { resolveKnockoutResult } from './knockout'
import { parseResultsRules } from './parse-rules'
import { parseProgressionRules, type ProgressionRules } from './progression-rules'
import { finalSlots } from './final-slots'
import { standardProgression } from './standard-progression'
import { progressionSourceHash, type ProgressionSource } from './progression-source'
import { type ProgressionConfirmDto, type ProgressionPreviewDto } from './results.dto'
import {
  loadGroups,
  loadParticipants,
  loadResultFixtures,
  type ResultsTransaction,
} from './results.repository'
import { calculateResultStandings } from './standings'
import { compatibleResultRules } from './roster-rule-compatibility'

function failure(status: HttpStatus, message: string, reason: string): ApiHttpException {
  return new ApiHttpException(status, {
    code:
      status === HttpStatus.CONFLICT
        ? ERROR_CODES.CONFLICT
        : status === HttpStatus.NOT_FOUND
          ? ERROR_CODES.NOT_FOUND
          : ERROR_CODES.BAD_REQUEST,
    message,
    details: { reason },
  })
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
type PlannedSlot = {
  targetMatchId: string
  side: 'HOME' | 'AWAY'
  teamId: string
  previousTeamId: string | null
}
type ProgressionActor = {
  organizationId: string
  userId: string
  user: { roles: ReadonlyArray<{ role: string; scopeType: string; scopeId: string }> }
}

@Injectable()
export class ResultsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccessPolicyService) private readonly policy: AccessPolicyService,
  ) {}

  private async rules(
    tx: ResultsTransaction,
    organizationId: string,
    tournamentId: string,
    ruleVersionId?: string,
  ) {
    const row = await tx.competitionRuleVersion.findFirst({
      where: {
        organizationId,
        tournamentId,
        ...(ruleVersionId ? { id: ruleVersionId } : {}),
        status: 'PUBLISHED',
      },
      orderBy: { version: 'desc' },
    })
    if (!row)
      throw failure(HttpStatus.UNPROCESSABLE_ENTITY, '赛事规程尚未配置', 'RESULTS_RULES_REQUIRED')
    try {
      return { row, engine: parseResultsRules(row.id, row.rules) }
    } catch (error) {
      throw failure(
        HttpStatus.UNPROCESSABLE_ENTITY,
        '赛事规程尚未配置或不支持当前计算',
        error instanceof CompetitionRuleError ? error.code : 'INVALID_RESULTS_RULES',
      )
    }
  }

  private async compatibleRuleIds(
    tx: ResultsTransaction,
    organizationId: string,
    tournamentId: string,
    current: { id: string; rules: unknown },
    referencedIds: string[],
  ) {
    const compatible = new Set([current.id])
    const previousIds = [...new Set(referencedIds)].filter((id) => id !== current.id)
    if (!previousIds.length) return compatible
    const previous = await tx.competitionRuleVersion.findMany({
      where: { organizationId, tournamentId, id: { in: previousIds } },
      select: { id: true, rules: true },
    })
    for (const rule of previous)
      if (compatibleResultRules(rule.rules, current.rules)) compatible.add(rule.id)
    return compatible
  }

  async readTournamentResults(
    organizationId: string,
    tournamentId: string,
    transaction?: ResultsTransaction,
  ) {
    tournamentId = tournamentId.toLowerCase()
    await selectPublicTournament(transaction ?? this.prisma, organizationId, tournamentId)
    const read = async (tx: ResultsTransaction) => {
      const { row, engine } = await this.rules(tx, organizationId, tournamentId)
      const [allFixtures, participants, groups] = await Promise.all([
        loadResultFixtures(tx, organizationId, tournamentId),
        loadParticipants(tx, organizationId, tournamentId),
        loadGroups(tx, organizationId, tournamentId),
      ])
      const fixtures = allFixtures.filter((fixture) => fixture.status !== 'DRAFT')
      try {
        const facts = fixtures
          .map(confirmedResultFact)
          .filter((fact): fact is ResultFact & { ruleVersionId: string } => fact !== null)
        const compatible = await this.compatibleRuleIds(
          tx,
          organizationId,
          tournamentId,
          row,
          facts.map((fact) => fact.ruleVersionId),
        )
        requireRule(
          facts.every((fact) => compatible.has(fact.ruleVersionId)),
          'CONFIRMED_RULE_VERSION_MISMATCH',
        )
        for (const fact of facts.filter((item) => item.decision !== 'PLAYED')) {
          const score = resolveScore(fact, engine)
          requireRule(
            fact.homeScore === score.homeGoals && fact.awayScore === score.awayGoals,
            'CONFIRMED_FORFEIT_SCORE_MISMATCH',
          )
        }
        return {
          tournamentId,
          ruleVersionId: row.id,
          mode: 'OFFICIAL' as const,
          groups: groups.map((group) => ({
            id: group.id,
            standings: calculateResultStandings(
              { organizationId, tournamentId, stageId: group.stageId, groupId: group.id },
              participants.filter((team) => team.groupId === group.id).map((team) => team.teamId),
              facts.filter((fact) => fact.groupId === group.id),
              engine,
              'OFFICIAL',
            ),
          })),
          confirmedResults: facts.map((fact) => {
            const score = fact.status === 'VOID' ? null : resolveScore(fact, engine)
            return {
              ...fact,
              homeScore: score?.homeGoals ?? fact.homeScore,
              awayScore: score?.awayGoals ?? fact.awayScore,
              playedAt: fact.playedAt.toISOString(),
            }
          }),
          sourceVersions: Object.fromEntries(
            fixtures.map((fixture) => [fixture.id, fixture.confirmedReportVersion ?? 0]),
          ),
        }
      } catch (error) {
        this.ruleFailure(error)
      }
    }
    return transaction
      ? read(transaction)
      : this.prisma.$transaction(read, { isolationLevel: 'RepeatableRead' })
  }

  async preview(
    authorization: string | undefined,
    tournamentId: string,
    dto: ProgressionPreviewDto,
  ) {
    tournamentId = tournamentId.toLowerCase()
    const session = await this.auth.requireSession(authorization)
    await this.policy.requireTournamentAdministrator(session, tournamentId)
    return this.prisma.$transaction(
      (tx) =>
        this.previewAvailableRound(
          tx,
          session.organizationId,
          tournamentId,
          dto.ruleVersionId,
          false,
        ),
      { isolationLevel: 'RepeatableRead' },
    )
  }

  private ruleFailure(error: unknown): never {
    if (error instanceof ApiHttpException) throw error
    if (error instanceof CompetitionRuleError && error.code === 'CONFIRMED_MATCH_CONTEXT_CHANGED')
      throw failure(HttpStatus.CONFLICT, '比赛上下文已变化，请先核对冻结报告', error.code)
    if (error instanceof CompetitionRuleError)
      throw failure(HttpStatus.UNPROCESSABLE_ENTITY, '赛果或规程不能完成当前计算', error.code)
    throw error
  }

  private async buildPreview(
    tx: ResultsTransaction,
    organizationId: string,
    tournamentId: string,
    ruleVersionId: string,
    lock: boolean,
    explicitSlots?: ProgressionRules,
    automatic = false,
  ) {
    try {
      const tournamentRows = await tx.$queryRawUnsafe<Array<{ id: string; version: number }>>(
        `SELECT id, progression_version AS version FROM tournaments WHERE organization_id = $1::uuid AND id = $2::uuid ${lock ? 'FOR UPDATE' : ''}`,
        organizationId,
        tournamentId,
      )
      const tournament = tournamentRows[0]
      if (!tournament)
        throw failure(HttpStatus.NOT_FOUND, '当前组织不存在该赛事', 'TOURNAMENT_NOT_FOUND')
      const { row, engine } = await this.rules(tx, organizationId, tournamentId, ruleVersionId)
      const progression = explicitSlots ?? parseProgressionRules(row.rules)
      const targets = [...new Set(progression.slots.map((slot) => slot.targetMatchId))]
      const [fixtures, teams, groups] = await Promise.all([
        loadResultFixtures(
          tx,
          organizationId,
          tournamentId,
          lock,
          progression.sourceStageId,
          targets,
        ),
        loadParticipants(tx, organizationId, tournamentId),
        loadGroups(tx, organizationId, tournamentId),
      ])
      const sourceGroups = new Set(
        progression.slots.flatMap((slot) =>
          slot.source.type === 'GROUP_RANK' ? [slot.source.groupId] : [],
        ),
      )
      const sourceMatchIds = new Set(
        progression.slots.flatMap((slot) =>
          slot.source.type === 'GROUP_RANK' ? [] : [slot.source.matchId],
        ),
      )
      const sourceFixtures = fixtures.filter(
        (fixture) =>
          fixture.stageId === progression.sourceStageId &&
          (sourceMatchIds.has(fixture.id) ||
            (fixture.groupId !== null && sourceGroups.has(fixture.groupId))),
      )
      requireRule(sourceFixtures.length > 0, 'NO_SOURCE_MATCHES')
      requireRule(
        targets.every((id) =>
          fixtures.some(
            (fixture) =>
              fixture.id === id && !sourceFixtures.some((source) => source.id === fixture.id),
          ),
        ),
        'INVALID_PROGRESSION_TARGET',
      )
      const targetFixtures = fixtures.filter((fixture) => targets.includes(fixture.id))
      const source: ProgressionSource = {
        organizationId,
        tournamentId,
        stageId: progression.sourceStageId,
        ruleVersionId: row.id,
        teams,
        matches: sourceFixtures.map((fixture) => ({
          matchId: fixture.id,
          confirmedReportVersion: fixture.confirmedReportVersion ?? 0,
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          groupId: fixture.groupId,
        })),
        targets: targetFixtures.map(({ id, homeTeamId, awayTeamId }) => ({
          matchId: id,
          homeTeamId,
          awayTeamId,
        })),
      }
      const factsHash = progressionSourceHash(source)
      const sourceHash = explicitSlots
        ? createHash('sha256')
            .update(JSON.stringify([factsHash, explicitSlots.slots]))
            .digest('hex')
        : factsHash
      const reasons: string[] = []
      if (automatic)
        for (const groupId of sourceGroups) {
          const entrants = new Set(
            teams.filter((team) => team.groupId === groupId).map((team) => team.teamId),
          )
          const games = sourceFixtures.filter((fixture) => fixture.groupId === groupId)
          const pairs = new Set(
            games.map((game) => [game.homeTeamId, game.awayTeamId].sort().join(':')),
          )
          if (
            entrants.size < 2 ||
            games.length !== (entrants.size * (entrants.size - 1)) / 2 ||
            pairs.size !== games.length ||
            games.some(
              (game) =>
                game.status === 'DRAFT' ||
                game.homeTeamId === game.awayTeamId ||
                !entrants.has(game.homeTeamId ?? '') ||
                !entrants.has(game.awayTeamId ?? ''),
            )
          )
            reasons.push('SOURCE_GROUP_SCHEDULE_INCOMPLETE')
        }
      const facts = sourceFixtures
        .map(confirmedResultFact)
        .filter((fact): fact is ResultFact & { ruleVersionId: string } => fact !== null)
      if (facts.length !== sourceFixtures.length) reasons.push('SOURCE_UNCONFIRMED')
      if (facts.some((fact) => fact.status === 'VOID')) reasons.push('SOURCE_VOID')
      const compatible = await this.compatibleRuleIds(
        tx,
        organizationId,
        tournamentId,
        row,
        facts.map((fact) => fact.ruleVersionId),
      )
      if (facts.some((fact) => !compatible.has(fact.ruleVersionId)))
        reasons.push('CONFIRMED_RULE_VERSION_MISMATCH')
      if (!reasons.length)
        for (const fact of facts.filter((item) => item.decision !== 'PLAYED')) {
          const score = resolveScore(fact, engine)
          if (fact.homeScore !== score.homeGoals || fact.awayScore !== score.awayGoals)
            reasons.push('CONFIRMED_FORFEIT_SCORE_MISMATCH')
        }
      const assignments: PlannedSlot[] = []
      if (!reasons.length)
        for (const slot of progression.slots) {
          const slotSource = slot.source
          let teamId: string | undefined
          if (slotSource.type === 'GROUP_RANK') {
            const group = groups.find(
              (item) =>
                item.id === slotSource.groupId && item.stageId === progression.sourceStageId,
            )
            requireRule(group, 'INVALID_PROGRESSION_GROUP')
            const table = calculateResultStandings(
              {
                organizationId,
                tournamentId,
                stageId: progression.sourceStageId,
                groupId: group.id,
              },
              teams.filter((team) => team.groupId === group.id).map((team) => team.teamId),
              facts.filter((fact) => fact.groupId === group.id),
              engine,
              'OFFICIAL',
            )
            const candidates = table.rows.filter((standing) => standing.rank === slotSource.rank)
            if (candidates.length !== 1) reasons.push('UNRESOLVED_GROUP_RANK')
            else teamId = candidates[0]!.teamId
          } else {
            const fact = facts.find((item) => item.id === slotSource.matchId)
            requireRule(fact, 'INVALID_PROGRESSION_MATCH')
            const result = resolveKnockoutResult(
              {
                organizationId,
                tournamentId,
                stageId: progression.sourceStageId,
                groupId: fact.groupId,
              },
              fact,
              engine,
            )
            if (result.status === 'BLOCKED') reasons.push(result.reason)
            else
              teamId = slotSource.type === 'MATCH_WINNER' ? result.winnerTeamId : result.loserTeamId
          }
          if (teamId) {
            const target = targetFixtures.find((fixture) => fixture.id === slot.targetMatchId)!
            assignments.push({
              targetMatchId: slot.targetMatchId,
              side: slot.side,
              teamId,
              previousTeamId: slot.side === 'HOME' ? target.homeTeamId : target.awayTeamId,
            })
          }
        }
      const boundLineups = await tx.$queryRawUnsafe<Array<{ matchId: string }>>(
        `SELECT DISTINCT match_id AS "matchId" FROM team_lineup_plans
        WHERE organization_id = $1::uuid AND tournament_id = $2::uuid AND match_id = ANY($3::uuid[])
          AND kind = 'MATCH_LINEUP' AND roster_snapshot_id IS NOT NULL`,
        organizationId,
        tournamentId,
        targets,
      )
      const assignedTeams = new Map<string, string>()
      for (const slot of assignments) {
        const previous = assignedTeams.get(slot.teamId)
        if (previous && previous !== slot.targetMatchId) reasons.push('DUPLICATE_QUALIFIER')
        assignedTeams.set(slot.teamId, slot.targetMatchId)
      }
      for (const targetId of targets) {
        if (boundLineups.some((lineup) => lineup.matchId === targetId))
          reasons.push('TARGET_LINEUP_ALREADY_BOUND')
        const target = fixtures.find((fixture) => fixture.id === targetId)!
        if (
          !['DRAFT', 'SCHEDULED', 'POSTPONED'].includes(target.status) ||
          target.reportVersion > 0 ||
          target.confirmedReportVersion !== null ||
          target.actualStartedAt !== null ||
          target.actualEndedAt !== null
        )
          reasons.push('TARGET_ALREADY_STARTED_OR_REPORTED')
        const home =
          assignments.find((slot) => slot.targetMatchId === targetId && slot.side === 'HOME')
            ?.teamId ?? target.homeTeamId
        const away =
          assignments.find((slot) => slot.targetMatchId === targetId && slot.side === 'AWAY')
            ?.teamId ?? target.awayTeamId
        if (home && home === away) reasons.push('SAME_TEAM_TARGET')
      }
      return {
        tournamentId,
        ruleVersionId: row.id,
        version: tournament.version,
        sourceHash,
        sourceVersions: source,
        slots: assignments,
        status: reasons.length ? ('BLOCKED' as const) : ('READY' as const),
        reasons: [...new Set(reasons)],
      }
    } catch (error) {
      this.ruleFailure(error)
    }
  }

  private async finalRound(tx: ResultsTransaction, organizationId: string, tournamentId: string) {
    return finalSlots(
      await tx.match.findMany({
        where: {
          organizationId,
          tournamentId,
          status: { not: 'CANCELLED' },
          stage: { type: 'KNOCKOUT' },
        },
        select: { id: true, title: true, matchCode: true, stageId: true },
      }),
    )
  }

  private async fallbackPlans(
    tx: ResultsTransaction,
    organizationId: string,
    tournamentId: string,
    rules: unknown,
  ) {
    const legacy = await this.finalRound(tx, organizationId, tournamentId)
    const defaults = await standardProgression(tx, organizationId, tournamentId, rules)
    return legacy
      ? [
          legacy,
          ...defaults.filter(
            (plan) =>
              !plan.slots.some((slot) =>
                legacy.slots.some((existing) => existing.targetMatchId === slot.targetMatchId),
              ),
          ),
        ]
      : defaults
  }

  private async previewAvailableRound(
    tx: ResultsTransaction,
    organizationId: string,
    tournamentId: string,
    ruleVersionId: string,
    lock: boolean,
  ) {
    const { row } = await this.rules(tx, organizationId, tournamentId, ruleVersionId)
    const explicit =
      row.rules && typeof row.rules === 'object' && 'progression' in row.rules
        ? parseProgressionRules(row.rules)
        : null
    const configured = explicit
      ? await this.buildPreview(tx, organizationId, tournamentId, ruleVersionId, lock)
      : null
    if (configured?.slots.some((slot) => slot.teamId !== slot.previousTeamId)) return configured
    let firstPending: Awaited<ReturnType<ResultsService['buildPreview']>> | null = null
    for (const plan of await this.fallbackPlans(tx, organizationId, tournamentId, row.rules)) {
      if (
        plan.slots.some((slot) =>
          explicit?.slots.some((declared) => declared.targetMatchId === slot.targetMatchId),
        )
      )
        continue
      const preview = await this.buildPreview(
        tx,
        organizationId,
        tournamentId,
        ruleVersionId,
        lock,
        plan,
        true,
      )
      const changes = preview.slots.filter((slot) => slot.teamId !== slot.previousTeamId)
      if (changes.length && changes.every((slot) => slot.previousTeamId === null)) return preview
      firstPending ??= preview
    }
    return (
      configured ??
      firstPending ??
      this.buildPreview(tx, organizationId, tournamentId, ruleVersionId, lock)
    )
  }

  /** Report writes already hold the tournament lock before taking any match lock. */
  async advanceFromConfirmedMatch(
    tx: ResultsTransaction,
    session: AuthenticatedSession,
    tournamentId: string,
    matchId: string,
    groupId: string | null,
    requestId: string,
  ) {
    const organizationId = session.organizationId
    const published = await tx.competitionRuleVersion.findFirst({
      where: { organizationId, tournamentId, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
      select: { id: true, rules: true },
    })
    if (!published) return
    let preview: Awaited<ReturnType<ResultsService['buildPreview']>>
    try {
      const explicit =
        published.rules && typeof published.rules === 'object' && 'progression' in published.rules
          ? parseProgressionRules(published.rules)
          : null
      const fromReportedMatch = (slot: ProgressionRules['slots'][number]) =>
        slot.source.type === 'GROUP_RANK'
          ? !!groupId && slot.source.groupId === groupId
          : slot.source.matchId === matchId
      const plan = explicit?.slots.some(fromReportedMatch)
        ? explicit
        : (await this.fallbackPlans(tx, organizationId, tournamentId, published.rules)).find(
            (candidate) =>
              candidate.slots.some(fromReportedMatch) &&
              !candidate.slots.some((slot) =>
                explicit?.slots.some((declared) => declared.targetMatchId === slot.targetMatchId),
              ),
          )
      if (!plan) return
      const relevant = {
        sourceStageId: plan.sourceStageId,
        slots: plan.slots.filter(fromReportedMatch),
      }
      preview = await this.buildPreview(
        tx,
        organizationId,
        tournamentId,
        published.id,
        true,
        relevant,
        true,
      )
    } catch (error) {
      // Invalid or unresolved competition rules do not invalidate a confirmed match report.
      if (error instanceof ApiHttpException || error instanceof CompetitionRuleError) return
      throw error
    }
    const changes = preview.slots.filter((slot) => slot.teamId !== slot.previousTeamId)
    if (
      preview.status !== 'READY' ||
      !changes.length ||
      changes.some((slot) => slot.previousTeamId !== null)
    )
      return
    await this.persistProgression(
      tx,
      session,
      preview,
      '正式赛果确认后自动填入晋级签位',
      requestId,
      true,
    )
  }

  /** Restricted to the operations CLI. Reuse the official preview and write protection. */
  async reconcileKnockoutSlots(
    organizationId: string,
    tournamentId: string,
    targetCodes: string[],
    expectedHash?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        if (expectedHash)
          await tx.$queryRaw`SELECT id FROM tournaments WHERE organization_id = ${organizationId}::uuid AND id = ${tournamentId}::uuid FOR UPDATE`
        const tournament = await tx.tournament.findFirst({
          where: { id: tournamentId, organizationId, status: 'PUBLISHED' },
          select: { id: true },
        })
        const targets = await tx.match.findMany({
          where: {
            tournamentId,
            organizationId,
            matchCode: { in: targetCodes },
            status: { not: 'DRAFT' },
            stage: { type: 'KNOCKOUT' },
          },
          select: { id: true, matchCode: true },
          orderBy: { matchCode: 'asc' },
        })
        if (!tournament || !targetCodes.length || targets.length !== targetCodes.length)
          throw failure(
            HttpStatus.NOT_FOUND,
            '未找到全部指定的正式淘汰赛场次',
            'RECONCILIATION_TARGETS_NOT_FOUND',
          )
        const { row } = await this.rules(tx, organizationId, tournamentId)
        const explicit =
          row.rules && typeof row.rules === 'object' && 'progression' in row.rules
            ? parseProgressionRules(row.rules)
            : null
        const ids = new Set(targets.map((target) => target.id))
        const defaults = (
          await this.fallbackPlans(tx, organizationId, tournamentId, row.rules)
        ).filter(
          (plan) =>
            !plan.slots.some(
              (slot) =>
                ids.has(slot.targetMatchId) &&
                explicit?.slots.some((declared) => declared.targetMatchId === slot.targetMatchId),
            ),
        )
        const plans = explicit ? [explicit, ...defaults] : defaults
        const plan = plans
          .map((candidate) => ({
            ...candidate,
            slots: candidate.slots.filter((slot) => ids.has(slot.targetMatchId)),
          }))
          .find(
            (candidate) =>
              candidate.slots.length === targets.length * 2 &&
              candidate.slots.every((slot) => slot.source.type !== 'GROUP_RANK'),
          )
        if (!plan)
          throw failure(
            HttpStatus.CONFLICT,
            '指定场次没有完整的胜负来源',
            'RECONCILIATION_SOURCES_REQUIRED',
          )
        const preview = await this.buildPreview(
          tx,
          organizationId,
          tournamentId,
          row.id,
          Boolean(expectedHash),
          plan,
          true,
        )
        const changes = preview.slots.filter((slot) => slot.teamId !== slot.previousTeamId)
        if (preview.status !== 'READY' || changes.some((slot) => slot.previousTeamId !== null))
          throw failure(
            HttpStatus.CONFLICT,
            '来源未确认、比赛已锁定或已有正式对阵冲突',
            preview.reasons.join(',') || 'RECONCILIATION_EXISTING_TEAMS',
          )
        const teams = await tx.team.findMany({
          where: { organizationId, id: { in: changes.map((slot) => slot.teamId) } },
          select: { id: true, name: true },
        })
        const result = {
          mode: expectedHash ? 'apply' : 'preview',
          sourceHash: preview.sourceHash,
          changes: changes.map((slot) => ({
            matchCode: targets.find((target) => target.id === slot.targetMatchId)!.matchCode,
            side: slot.side,
            team: teams.find((team) => team.id === slot.teamId)?.name ?? slot.teamId,
          })),
        }
        if (!expectedHash || !changes.length) return result
        if (expectedHash !== preview.sourceHash)
          throw failure(HttpStatus.CONFLICT, '来源已变化，请重新预览', 'PROGRESSION_SOURCE_CHANGED')
        const actors = await tx.user.findMany({
          where: {
            profileCohort: 'SYSTEM',
            displayName: '晓球管理员',
            status: 'ACTIVE',
            memberships: { some: { organizationId, status: 'ACTIVE' } },
          },
          take: 2,
          select: {
            id: true,
            roleAssignments: {
              where: {
                organizationId,
                role: 'ORGANIZATION_ADMIN',
                scopeType: 'ORGANIZATION',
                scopeId: organizationId,
                revokedAt: null,
                grantedAt: { lte: new Date() },
              },
              select: { role: true, scopeId: true, scopeType: true },
            },
          },
        })
        const actor = actors[0]
        if (actors.length !== 1 || !actor?.roleAssignments.length)
          throw failure(
            HttpStatus.FORBIDDEN,
            '当前组织没有可用于审计的系统管理员',
            'RECONCILIATION_ACTOR_REQUIRED',
          )
        await this.persistProgression(
          tx,
          { organizationId, userId: actor.id, user: { roles: actor.roleAssignments } },
          preview,
          '根据已确认赛果补齐历史空签位',
          `reconcile-knockout-${randomUUID()}`,
          true,
          'CLI',
        )
        return result
      },
      { isolationLevel: 'Serializable' },
    )
  }

  private async persistProgression(
    tx: ResultsTransaction,
    session: ProgressionActor,
    preview: Awaited<ReturnType<ResultsService['buildPreview']>>,
    reason: string,
    requestId: string,
    automatic = false,
    origin = 'API',
  ) {
    const { tournamentId } = preview
    const version = preview.version + 1
    const affected = await tx.$executeRawUnsafe(
      'UPDATE tournaments SET progression_version = $3::integer, updated_at = now() WHERE organization_id = $1::uuid AND id = $2::uuid AND progression_version = $4::integer',
      session.organizationId,
      tournamentId,
      version,
      preview.version,
    )
    if (affected !== 1)
      throw failure(HttpStatus.CONFLICT, '晋级版本已变化', 'PROGRESSION_VERSION_CONFLICT')
    for (const slot of preview.slots) {
      if (slot.teamId === slot.previousTeamId) continue
      const column = slot.side === 'HOME' ? 'home_team_id' : 'away_team_id'
      const count = await tx.$executeRawUnsafe(
        `UPDATE matches SET ${column} = $3::uuid, updated_at = now() WHERE organization_id = $1::uuid AND tournament_id = $2::uuid AND id = $4::uuid AND actual_started_at IS NULL AND actual_ended_at IS NULL AND report_version = 0 AND confirmed_report_version IS NULL AND status IN ('DRAFT','SCHEDULED','POSTPONED') AND ${column} IS NOT DISTINCT FROM $5::uuid`,
        session.organizationId,
        tournamentId,
        slot.teamId,
        slot.targetMatchId,
        slot.previousTeamId,
      )
      if (count !== 1)
        throw failure(
          HttpStatus.CONFLICT,
          '目标比赛不能再更换球队',
          'TARGET_ALREADY_STARTED_OR_REPORTED',
        )
    }
    const progressionId = randomUUID()
    await tx.$executeRawUnsafe(
      `INSERT INTO tournament_progressions (id, organization_id, tournament_id, version, source_hash, source_versions, slots, rule_version_id, created_by_user_id, reason)
    VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::jsonb,$7::jsonb,$8::uuid,$9::uuid,$10)`,
      progressionId,
      session.organizationId,
      tournamentId,
      version,
      preview.sourceHash,
      JSON.stringify(preview.sourceVersions),
      JSON.stringify(preview.slots),
      preview.ruleVersionId,
      session.userId,
      reason,
    )
    const response = {
      id: progressionId,
      tournamentId,
      version,
      sourceHash: preview.sourceHash,
      slots: preview.slots,
    }
    await tx.auditLog.create({
      data: {
        organizationId: session.organizationId,
        actorType: automatic ? 'SYSTEM' : 'ADMIN',
        actorUserId: session.userId,
        actorRoleSnapshot: json(
          session.user.roles.map((role) => ({
            role: role.role,
            scopeType: role.scopeType,
            scopeId: role.scopeId,
          })),
        ),
        action: 'TOURNAMENT_PROGRESSION_CONFIRMED',
        targetType: 'Tournament',
        targetId: tournamentId,
        beforeSummary: { version: preview.version },
        afterSummary: json(response),
        reason: reason,
        requestId,
        source: origin,
      },
    })
    await tx.outboxJob.create({
      data: {
        organizationId: session.organizationId,
        topic: 'tournament.progression',
        aggregateType: 'Tournament',
        aggregateId: tournamentId,
        eventType: 'TournamentProgressionConfirmed',
        payload: json(response),
        deduplicationKey: `tournament-progression-confirmed:${tournamentId}:${version}`,
        correlationId: requestId,
      },
    })
    return response
  }

  async confirm(
    authorization: string | undefined,
    tournamentId: string,
    dto: ProgressionConfirmDto,
    idempotencyKey: string | undefined,
    requestId: string,
  ) {
    tournamentId = tournamentId.toLowerCase()
    dto = { ...dto, ruleVersionId: dto.ruleVersionId.toLowerCase() }
    if (
      !idempotencyKey ||
      idempotencyKey.length > 128 ||
      !idempotencyKey.trim() ||
      !dto.reason.trim()
    )
      throw failure(HttpStatus.BAD_REQUEST, '需要幂等键和确认原因', 'PROGRESSION_REQUEST_REQUIRED')
    const session = await this.auth.requireSession(authorization)
    await this.policy.requireTournamentAdministrator(session, tournamentId)
    const route = `/admin/tournaments/${tournamentId}/progression/confirm`
    const command = {
      ruleVersionId: dto.ruleVersionId,
      expectedVersion: dto.expectedVersion,
      sourceHash: dto.sourceHash,
      reason: dto.reason.trim(),
    }
    const requestHash = createHash('sha256').update(JSON.stringify(command)).digest('hex')
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRawUnsafe(
            'SELECT id FROM tournaments WHERE organization_id = $1::uuid AND id = $2::uuid FOR UPDATE',
            session.organizationId,
            tournamentId,
          )
          const existing = await tx.idempotencyRecord.findFirst({
            where: {
              organizationId: session.organizationId,
              userId: session.userId,
              route,
              idempotencyKey,
            },
          })
          if (existing) {
            if (existing.requestHash !== requestHash)
              throw failure(HttpStatus.CONFLICT, '幂等键已用于其他请求', 'IDEMPOTENCY_CONFLICT')
            if (existing.responseStatus !== 200 || existing.responseBody === null)
              throw failure(
                HttpStatus.CONFLICT,
                '此前命令尚无成功回执，请保留幂等键重试',
                'IDEMPOTENCY_IN_PROGRESS',
              )
            return existing.responseBody
          }
          const preview = await this.previewAvailableRound(
            tx,
            session.organizationId,
            tournamentId,
            dto.ruleVersionId,
            true,
          )
          if (preview.sourceHash !== dto.sourceHash)
            throw failure(
              HttpStatus.CONFLICT,
              '来源赛果已变化，请重新预览',
              'PROGRESSION_SOURCE_CHANGED',
            )
          if (preview.status !== 'READY')
            throw failure(HttpStatus.CONFLICT, '当前不能确认晋级', preview.reasons.join(','))
          if (preview.version !== dto.expectedVersion)
            throw failure(
              HttpStatus.CONFLICT,
              '晋级版本已变化，请重新预览',
              'PROGRESSION_VERSION_CONFLICT',
            )
          const response = await this.persistProgression(
            tx,
            session,
            preview,
            command.reason,
            requestId,
          )
          await tx.idempotencyRecord.create({
            data: {
              organizationId: session.organizationId,
              userId: session.userId,
              route,
              idempotencyKey,
              requestHash,
              responseStatus: 200,
              responseBody: json(response),
              resourceType: 'TournamentProgression',
              resourceId: response.id,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          })
          return response
        },
        { isolationLevel: 'Serializable', timeout: 10000 },
      )
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
      const meta = error && typeof error === 'object' && 'meta' in error ? error.meta : undefined
      const sqlCode = meta && typeof meta === 'object' && 'code' in meta ? meta.code : undefined
      if (code === 'P2034' || (code === 'P2010' && (sqlCode === '40001' || sqlCode === '40P01')))
        throw failure(
          HttpStatus.CONFLICT,
          '并发变更，请重新预览或重试',
          'PROGRESSION_CONCURRENT_CHANGE',
        )
      throw error
    }
  }
}
