import { isUUID } from 'class-validator'
import type { Prisma } from '../generated/prisma/client'
import { parseResultsRules } from '../results/parse-rules'
import { parseProgressionRules } from '../results/progression-rules'
import { parseRosterPolicy } from '../roster/roster-workflow.rules'
import { eightASideRuleDocument } from '../schedule/eight-a-side-rules'
import { centerError } from './admin-center.policy'

/** Structure uses existing rule engines; every referenced object is verified in the write transaction. */
export async function validateManagementRules(
  tx: Prisma.TransactionClient,
  organizationId: string,
  tournamentId: string,
  ruleVersionId: string,
  document: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  document = eightASideRuleDocument(document)
  if (
    Object.keys(document).some(
      (key) => !['results', 'roster', 'progression', 'summary'].includes(key),
    )
  )
    throw centerError(400, '规程包含未支持的配置分支')
  if (
    document.summary !== undefined &&
    (typeof document.summary !== 'string' || document.summary.length > 1000)
  )
    throw centerError(400, '规程summary必须为最多1000字的说明')
  if (Buffer.byteLength(JSON.stringify(document), 'utf8') > 256 * 1024)
    throw centerError(400, '规程数据超过256 KiB，请缩小资格名单')
  try {
    parseResultsRules(ruleVersionId, document)
  } catch {
    throw centerError(400, '必须提供受支持的完整 rules.results（积分、同分、点球和弃权政策）')
  }
  const roster = parseRosterPolicy(document)
  if (
    !roster ||
    !document.roster ||
    typeof document.roster !== 'object' ||
    Array.isArray(document.roster)
  )
    throw centerError(400, '必须提供有效的 rules.roster 人数、资格名单与带时区截止时间')
  if (
    Object.keys(document.roster).some(
      (key) =>
        ![
          'minPlayers',
          'maxPlayers',
          'submissionDeadline',
          'eligiblePlayerIds',
          'playersOnPitch',
        ].includes(key),
    )
  )
    throw centerError(400, 'rules.roster 包含未支持字段')
  if (roster.eligiblePlayerIds.length > 5000 || roster.eligiblePlayerIds.some((id) => !isUUID(id)))
    throw centerError(400, '资格名单必须是最多5000个有效球员UUID')
  const eligibleIds = roster.eligiblePlayerIds.map((id) => id.toLowerCase())
  if (new Set(eligibleIds).size !== eligibleIds.length)
    throw centerError(400, '资格名单不能重复球员ID')
  if (eligibleIds.length) {
    const eligibleCount = await tx.playerProfile.count({
      where: {
        id: { in: eligibleIds },
        organizationId,
        teamMemberships: {
          some: {
            organizationId,
            status: 'ACTIVE',
            team: {
              organizationId,
              registrations: {
                some: {
                  organizationId,
                  tournamentId,
                  status: { notIn: ['WITHDRAWN', 'SUSPENDED'] },
                },
              },
            },
          },
        },
      },
    })
    if (eligibleCount !== eligibleIds.length)
      throw centerError(400, '资格球员必须是本组织且属于本赛事报名球队的现役成员')
  }
  const output = JSON.parse(JSON.stringify(document)) as Record<string, unknown>
  output.roster = { ...(output.roster as Record<string, unknown>), eligiblePlayerIds: eligibleIds }
  if (!Object.hasOwn(document, 'progression')) return output
  let progression: ReturnType<typeof parseProgressionRules>
  try {
    progression = parseProgressionRules(document)
  } catch {
    throw centerError(400, 'rules.progression 阶段、来源与目标签位结构无效')
  }
  const sourceStage = await tx.stage.findFirst({
    where: { id: progression.sourceStageId, organizationId, tournamentId },
    select: { id: true, type: true },
  })
  if (!sourceStage) throw centerError(400, '晋级来源阶段必须属于本组织当前赛事')
  const groups = progression.slots.flatMap((slot) =>
    slot.source.type === 'GROUP_RANK' ? [slot.source.groupId] : [],
  )
  const sourceIds = progression.slots.flatMap((slot) =>
    slot.source.type === 'GROUP_RANK' ? [] : [slot.source.matchId],
  )
  const targetIds = [...new Set(progression.slots.map((slot) => slot.targetMatchId))]
  const targetRows = await tx.match.findMany({
    where: {
      id: { in: targetIds },
      organizationId,
      tournamentId,
      stage: { organizationId, tournamentId },
    },
    select: { id: true, stageId: true, groupId: true },
  })
  if (targetRows.length !== targetIds.length)
    throw centerError(400, '晋级目标比赛必须绑定本组织当前赛事的有效赛制阶段')
  if (groups.length) {
    if (sourceStage.type !== 'GROUP') throw centerError(400, 'GROUP_RANK 来源必须使用小组赛阶段')
    const groupRows = await tx.tournamentGroup.findMany({
      where: {
        id: { in: [...new Set(groups)] },
        organizationId,
        stageId: sourceStage.id,
        stage: { tournamentId, organizationId },
      },
      select: {
        id: true,
        _count: {
          select: {
            registrations: {
              where: {
                organizationId,
                tournamentId,
                status: { notIn: ['WITHDRAWN', 'SUSPENDED'] },
              },
            },
          },
        },
      },
    })
    if (groupRows.length !== new Set(groups).size)
      throw centerError(400, '晋级来源小组必须属于当前赛事来源阶段')
    for (const slot of progression.slots) {
      if (slot.source.type !== 'GROUP_RANK') continue
      const groupId = slot.source.groupId
      const group = groupRows.find((row) => row.id === groupId)
      if (!group || slot.source.rank > group._count.registrations)
        throw centerError(400, '晋级排名不能超过来源小组的实际报名球队数')
    }
    if (targetRows.some((target) => target.groupId && groups.includes(target.groupId)))
      throw centerError(400, '晋级目标不能是其来源小组自己的比赛')
  }
  if (sourceIds.length) {
    const sourceRows = await tx.match.findMany({
      where: {
        id: { in: [...new Set(sourceIds)] },
        organizationId,
        tournamentId,
        stageId: sourceStage.id,
      },
      select: { id: true },
    })
    if (sourceRows.length !== new Set(sourceIds).size)
      throw centerError(400, '晋级来源比赛必须属于当前赛事来源阶段')
    const edges = new Map<string, string[]>()
    for (const slot of progression.slots) {
      if (slot.source.type === 'GROUP_RANK') continue
      const sourceId = slot.source.matchId
      edges.set(sourceId, [...(edges.get(sourceId) ?? []), slot.targetMatchId])
    }
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const cyclic = (id: string): boolean => {
      if (visiting.has(id)) return true
      if (visited.has(id)) return false
      visiting.add(id)
      if ((edges.get(id) ?? []).some(cyclic)) return true
      visiting.delete(id)
      visited.add(id)
      return false
    }
    if ([...edges.keys()].some(cyclic)) throw centerError(400, '晋级来源与目标比赛不能形成循环')
  }
  output.progression = progression
  return output
}
