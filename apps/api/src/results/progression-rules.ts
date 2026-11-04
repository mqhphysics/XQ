import { requireRule } from './competition-rules'

export type ProgressionSlotSource =
  | { type: 'GROUP_RANK'; groupId: string; rank: number }
  | { type: 'MATCH_WINNER' | 'MATCH_LOSER'; matchId: string }
export interface ProgressionRuleSlot {
  targetMatchId: string
  side: 'HOME' | 'AWAY'
  source: ProgressionSlotSource
}
export interface ProgressionRules {
  sourceStageId: string
  slots: ProgressionRuleSlot[]
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function parseProgressionRules(document: unknown): ProgressionRules {
  requireRule(
    document && typeof document === 'object' && !Array.isArray(document),
    'PROGRESSION_RULES_REQUIRED',
  )
  const value = (document as Record<string, unknown>).progression
  requireRule(
    value && typeof value === 'object' && !Array.isArray(value),
    'PROGRESSION_RULES_REQUIRED',
  )
  const rule = value as Record<string, unknown>
  requireRule(
    typeof rule.sourceStageId === 'string' && uuid.test(rule.sourceStageId),
    'INVALID_SOURCE_STAGE',
  )
  requireRule(
    Array.isArray(rule.slots) && rule.slots.length > 0 && rule.slots.length <= 128,
    'INVALID_PROGRESSION_SLOTS',
  )
  const destinations = new Set<string>()
  const sources = new Set<string>()
  const slots = rule.slots.map((raw): ProgressionRuleSlot => {
    requireRule(raw && typeof raw === 'object' && !Array.isArray(raw), 'INVALID_PROGRESSION_SLOT')
    const slot = raw as Record<string, unknown>
    requireRule(
      typeof slot.targetMatchId === 'string' && uuid.test(slot.targetMatchId),
      'INVALID_PROGRESSION_TARGET',
    )
    requireRule(slot.side === 'HOME' || slot.side === 'AWAY', 'INVALID_PROGRESSION_SIDE')
    requireRule(
      slot.source && typeof slot.source === 'object' && !Array.isArray(slot.source),
      'INVALID_PROGRESSION_SOURCE',
    )
    const input = slot.source as Record<string, unknown>
    let source: ProgressionSlotSource
    if (input.type === 'GROUP_RANK') {
      requireRule(
        typeof input.groupId === 'string' &&
          uuid.test(input.groupId) &&
          typeof input.rank === 'number' &&
          Number.isSafeInteger(input.rank) &&
          input.rank > 0,
        'INVALID_GROUP_RANK_SOURCE',
      )
      source = { type: 'GROUP_RANK', groupId: input.groupId.toLowerCase(), rank: input.rank }
    } else {
      requireRule(
        (input.type === 'MATCH_WINNER' || input.type === 'MATCH_LOSER') &&
          typeof input.matchId === 'string' &&
          uuid.test(input.matchId),
        'INVALID_MATCH_SOURCE',
      )
      source = { type: input.type, matchId: input.matchId.toLowerCase() }
    }
    const targetMatchId = slot.targetMatchId.toLowerCase()
    const destinationKey = `${targetMatchId}:${slot.side}`
    const sourceKey = JSON.stringify(source)
    requireRule(
      !destinations.has(destinationKey) && !sources.has(sourceKey),
      'DUPLICATE_PROGRESSION_MAPPING',
    )
    destinations.add(destinationKey)
    sources.add(sourceKey)
    return { targetMatchId, side: slot.side, source }
  })
  return { sourceStageId: rule.sourceStageId.toLowerCase(), slots }
}
