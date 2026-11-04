// This checks the existing backend's structural contract, not organizer approval or object ownership.
export function validateRuleDocument(value: unknown): string | null {
  const object = (input: unknown): input is Record<string, unknown> =>
    Boolean(input) && typeof input === 'object' && !Array.isArray(input)
  const nonnegative = (input: unknown) => Number.isSafeInteger(input) && Number(input) >= 0
  const uuid = (input: unknown) =>
    typeof input === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)
  const unique = (input: unknown, allowed: string[]) =>
    Array.isArray(input) &&
    input.every((item) => typeof item === 'string' && allowed.includes(item)) &&
    new Set(input).size === input.length
  if (!object(value)) return '规程必须是 JSON 对象。'
  if (!object(value.roster)) return '请配置完整的 roster 名单规则，不能仅发布 summary。'
  const roster = value.roster
  if (
    !nonnegative(roster.minPlayers) ||
    Number(roster.minPlayers) < 1 ||
    !nonnegative(roster.maxPlayers) ||
    Number(roster.maxPlayers) < Number(roster.minPlayers) ||
    Number(roster.maxPlayers) > 100
  )
    return '名单人数范围需为 1–100，且最大人数不少于最小人数。'
  if (
    typeof roster.submissionDeadline !== 'string' ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(roster.submissionDeadline) ||
    !Number.isFinite(Date.parse(roster.submissionDeadline))
  )
    return '名单提交期限需使用包含时区的 ISO 日期时间。'
  if (
    !Array.isArray(roster.eligiblePlayerIds) ||
    !roster.eligiblePlayerIds.every(uuid) ||
    new Set(roster.eligiblePlayerIds).size !== roster.eligiblePlayerIds.length
  )
    return '资格名单需填写不重复的稳定球员 UUID。'
  if (roster.playersOnPitch !== undefined && roster.playersOnPitch !== 8)
    return '新规程仅支持八人制，playersOnPitch 必须为 8。'
  if (!object(value.results)) return '请配置完整的 results 正式赛果规则。'
  const results = value.results
  if (
    Object.keys(results).some(
      (key) =>
        ![
          'points',
          'tieBreakers',
          'headToHead',
          'groupShootout',
          'knockoutShootout',
          'forfeit',
        ].includes(key),
    )
  )
    return 'results 包含当前后端不支持的规则字段。'
  if (
    !object(results.points) ||
    !['win', 'draw', 'loss'].every((key) =>
      nonnegative((results.points as Record<string, unknown>)[key]),
    )
  )
    return '胜/平/负积分需填写非负整数。'
  if (!unique(results.tieBreakers, ['GOAL_DIFFERENCE', 'GOALS_FOR', 'HEAD_TO_HEAD']))
    return 'tieBreakers 仅支持净胜球、进球数和相互战绩，且不能重复。'
  if (
    !object(results.headToHead) ||
    !unique(results.headToHead.criteria, ['POINTS', 'GOAL_DIFFERENCE', 'GOALS_FOR']) ||
    typeof results.headToHead.reapplyToRemainingTeams !== 'boolean' ||
    ((results.tieBreakers as string[]).includes('HEAD_TO_HEAD') &&
      !(results.headToHead.criteria as unknown[]).length)
  )
    return '请补齐 headToHead.criteria 与 reapplyToRemainingTeams。'
  if (
    !['REJECT', 'COUNT_AS_DRAW'].includes(String(results.groupShootout)) ||
    !['ALLOWED', 'DISABLED'].includes(String(results.knockoutShootout))
  )
    return '请填写有效的小组及淘汰赛点球规则。'
  if (
    !object(results.forfeit) ||
    !nonnegative(results.forfeit.winnerGoals) ||
    !nonnegative(results.forfeit.loserGoals) ||
    Number(results.forfeit.winnerGoals) <= Number(results.forfeit.loserGoals) ||
    Number(results.forfeit.winnerGoals) > 99 ||
    !Number.isSafeInteger(results.forfeit.loserPoints)
  )
    return '请配置完整弃权判罚：胜方进球大于负方，比分不超过99，负方积分为整数。'
  if (
    results.forfeit.both !== null &&
    (!object(results.forfeit.both) ||
      !nonnegative(results.forfeit.both.goals) ||
      !Number.isSafeInteger(results.forfeit.both.points))
  )
    return 'forfeit.both 需为 null 或包含 goals/points 的有效对象。'
  if (value.progression !== undefined) {
    if (
      !object(value.progression) ||
      !uuid(value.progression.sourceStageId) ||
      !Array.isArray(value.progression.slots) ||
      !value.progression.slots.length ||
      value.progression.slots.length > 128
    )
      return '晋级规则需包含 sourceStageId 和 1–128 个 slots。'
    const destinations = new Set<string>(),
      sources = new Set<string>()
    for (const slot of value.progression.slots) {
      if (
        !object(slot) ||
        !uuid(slot.targetMatchId) ||
        !['HOME', 'AWAY'].includes(String(slot.side)) ||
        !object(slot.source)
      )
        return '每个晋级位置需包含目标比赛、HOME/AWAY 和来源。'
      const source = slot.source
      if (source.type === 'GROUP_RANK') {
        if (!uuid(source.groupId) || !Number.isSafeInteger(source.rank) || Number(source.rank) < 1)
          return '小组来源需包含 groupId 和正整数 rank。'
      } else if (
        !['MATCH_WINNER', 'MATCH_LOSER'].includes(String(source.type)) ||
        !uuid(source.matchId)
      )
        return '比赛来源需为 MATCH_WINNER/MATCH_LOSER 并包含 matchId。'
      const target = `${slot.targetMatchId}:${slot.side}`,
        origin =
          source.type === 'GROUP_RANK'
            ? `${source.type}:${source.groupId}:${source.rank}`
            : `${source.type}:${source.matchId}`
      if (destinations.has(target) || sources.has(origin)) return '目标位置和来源不能重复分配。'
      destinations.add(target)
      sources.add(origin)
    }
  }
  return null
}
