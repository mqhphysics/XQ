import { fixtureRoundKind } from '@xiaoqiu/contracts'

export function fixtureRoundName(match: {
  matchCode: string
  title: string
  stage?: { type: string } | null
  round?: { name: string } | null
}): string | null {
  if (match.stage?.type === 'KNOCKOUT') {
    const kind = fixtureRoundKind({ ...match, roundName: match.round?.name ?? null })
    if (kind === 'final') return '决赛'
    if (kind === 'third') return '三四名赛'
  }
  return match.round?.name ?? null
}
