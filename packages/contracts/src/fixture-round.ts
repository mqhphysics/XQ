type RoundFields = { matchCode: string; title: string; roundName?: string | null }

/** A stage or round may group several different fixtures. Match-specific labels take priority. */
export function fixtureRoundKind(match: RoundFields) {
  if (/(?:^|[-_])THIRD$/i.test(match.matchCode)) return 'third'
  if (/(?:^|[-_])FINAL$/i.test(match.matchCode)) return 'final'
  let stage: 'semi' | 'quarter' | 'round16' | null = null
  for (const name of [match.roundName, match.title]) {
    const text = name?.trim().replace(/^(?:男足|女足)\s*/, '') || ''
    if (/^(?:三四名赛|季军赛)(?:$|[\s：:])/.test(text)) return 'third'
    if (/^(?:决赛|冠军赛)(?:$|[\s：:])/.test(text)) return 'final'
    if (/^(?:半决赛|二分之一决赛|1\/2决赛)(?:$|[\s：:])/.test(text)) stage ??= 'semi'
    if (/^(?:八强(?:赛)?|四分之一决赛|1\/4决赛)(?:$|[\s：:])/.test(text)) stage ??= 'quarter'
    if (/^十六强(?:赛)?(?:$|[\s：:])/.test(text)) stage ??= 'round16'
  }
  return stage
}

export function knockoutRoundLabel(match: RoundFields) {
  const kind = fixtureRoundKind(match)
  return kind
    ? { final: '决赛', third: '三四名赛', semi: '半决赛', quarter: '八强赛', round16: '十六强赛' }[
        kind
      ]
    : null
}
