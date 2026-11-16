import type { ProgressionRules } from './progression-rules'

type Fixture = { id: string; matchCode: string; title: string; stageId: string | null }

/** Older published schedules identify their sources in the official fixture titles and codes. */
export function finalSlots(fixtures: Fixture[]): ProgressionRules | null {
  const title = (fixture: Fixture) => fixture.title.replace(/\s/g, '').replace(':', '：')
  const final = fixtures.find(
    (match) =>
      /-FINAL$/i.test(match.matchCode) && title(match) === '决赛：半决赛1胜队vs半决赛2胜队',
  )
  if (!final?.stageId) return null
  const prefix = final.matchCode.slice(0, -'FINAL'.length)
  const first = fixtures.find((match) => match.matchCode === `${prefix}SF-01`)
  const second = fixtures.find((match) => match.matchCode === `${prefix}SF-02`)
  const third = fixtures.find(
    (match) =>
      match.matchCode === `${prefix}THIRD` && title(match) === '三四名赛：半决赛1负队vs半决赛2负队',
  )
  if (!first?.stageId || first.stageId !== second?.stageId || third?.stageId !== final.stageId)
    return null
  return {
    sourceStageId: first.stageId,
    slots: [
      {
        targetMatchId: final.id,
        side: 'HOME',
        source: { type: 'MATCH_WINNER', matchId: first.id },
      },
      {
        targetMatchId: final.id,
        side: 'AWAY',
        source: { type: 'MATCH_WINNER', matchId: second.id },
      },
      { targetMatchId: third.id, side: 'HOME', source: { type: 'MATCH_LOSER', matchId: first.id } },
      {
        targetMatchId: third.id,
        side: 'AWAY',
        source: { type: 'MATCH_LOSER', matchId: second.id },
      },
    ],
  }
}
