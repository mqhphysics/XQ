export function fixtureRoundName(match: {
  matchCode: string
  title: string
  stage?: { type: string } | null
  round?: { name: string } | null
}): string | null {
  if (match.stage?.type === 'KNOCKOUT') {
    if (/(?:^|[-_])FINAL$/i.test(match.matchCode)) return '决赛'
    if (/(?:^|[-_])THIRD$/i.test(match.matchCode)) return '三四名赛'
    const title = match.title.trim().replace(/^(?:男足|女足)\s*/, '')
    if (/^(?:决赛|冠军赛)(?:$|[\s：:])/.test(title)) return '决赛'
    if (/^(?:三四名赛|季军赛)(?:$|[\s：:])/.test(title)) return '三四名赛'
  }
  return match.round?.name ?? null
}
