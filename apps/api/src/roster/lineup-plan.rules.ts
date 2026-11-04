import type { SaveLineupPlanDto } from './lineup-plan.dto'
import { rosterError } from './roster-workflow.rules'

export function validateLineupPlan(input: SaveLineupPlanDto): string[] {
  if (!input.name.trim()) throw rosterError(400, '请填写战术名称')
  if (input.payload.format !== 8 || input.payload.slots.length !== 8)
    throw rosterError(400, '晓球阵容固定为八人制，必须提供 8 个场上位置')
  if (input.payload.slots.length !== input.payload.format)
    throw rosterError(400, '场上位置数量必须与人数制一致')
  const slots = input.payload.slots
  if (new Set(slots.map((slot) => slot.slotId)).size !== slots.length)
    throw rosterError(400, '场上位置编号不能重复')
  const playerIds = [
    ...slots.flatMap((slot) => (slot.playerId ? [slot.playerId] : [])),
    ...input.payload.benchPlayerIds,
  ]
  if (new Set(playerIds).size !== playerIds.length)
    throw rosterError(400, '同一球员只能安排一次，不能同时出现在首发和替补')
  if (input.payload.captainPlayerId && !playerIds.includes(input.payload.captainPlayerId))
    throw rosterError(400, '队长必须是本份阵容中的球员')
  if (input.kind === 'MATCH_LINEUP') {
    if (!input.matchId || !input.tournamentId || !input.rosterSnapshotId)
      throw rosterError(400, '单场阵容必须绑定比赛、赛事和锁定名单')
    if (slots.some((slot) => !slot.playerId))
      throw rosterError(400, '保存单场阵容前请补齐所有首发位置')
    if (slots.filter((slot) => slot.label === 'GK').length !== 1)
      throw rosterError(400, '单场阵容必须安排一个门将位置')
  } else if (input.matchId || input.rosterSnapshotId)
    throw rosterError(400, '普通战术不能绑定比赛或冒充单场阵容')
  return playerIds
}
