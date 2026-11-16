import { defaultGroupCrossing, fixtureRoundKind, groupQualifierCount } from '@xiaoqiu/contracts'
import type { ProgressionRules } from './progression-rules'
import type { ResultsTransaction } from './results.repository'

/** Standard draws use official fixture order. Explicit published rules override these plans. */
export async function standardProgression(
  tx: ResultsTransaction,
  organizationId: string,
  tournamentId: string,
  rules: unknown,
): Promise<ProgressionRules[]> {
  const [fixtures, groups] = await Promise.all([
    tx.match.findMany({
      where: {
        organizationId,
        tournamentId,
        stage: { type: 'KNOCKOUT' },
        status: { not: 'CANCELLED' },
      },
      select: {
        id: true,
        stageId: true,
        title: true,
        matchCode: true,
        round: { select: { name: true } },
      },
      orderBy: { matchCode: 'asc' },
    }),
    tx.tournamentGroup.findMany({
      where: { organizationId, stage: { tournamentId, type: 'GROUP' } },
      select: { id: true, stageId: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
  ])
  const matches = (kind: ReturnType<typeof fixtureRoundKind>) =>
    fixtures.filter(
      (fixture) =>
        fixtureRoundKind({ ...fixture, roundName: fixture.round?.name ?? null }) === kind,
    )
  const phases = [matches('round16'), matches('quarter'), matches('semi'), matches('final')]
  const third = matches('third')
  const plans: ProgressionRules[] = []
  for (let index = 0; index < phases.length - 1; index++) {
    const from = phases[index]!,
      to = phases[index + 1]!
    const stageId = from[0]?.stageId
    const expected = 8 / 2 ** index
    if (
      !stageId ||
      from.length !== expected ||
      to.length !== expected / 2 ||
      from.some((match) => match.stageId !== stageId)
    )
      continue
    const slots: ProgressionRules['slots'] = []
    for (const [sourceIndex, match] of from.entries()) {
      const side = sourceIndex % 2 === 0 ? 'HOME' : 'AWAY'
      slots.push({
        targetMatchId: to[Math.floor(sourceIndex / 2)]!.id,
        side,
        source: { type: 'MATCH_WINNER', matchId: match.id },
      })
      if (expected === 2 && third.length === 1)
        slots.push({
          targetMatchId: third[0]!.id,
          side,
          source: { type: 'MATCH_LOSER', matchId: match.id },
        })
    }
    plans.push({ sourceStageId: stageId, slots })
  }
  const first = phases.find((phase) => phase.length)
  const groupStage = groups[0]?.stageId
  const places = groupQualifierCount(rules) ?? ((first?.length ?? 0) * 2) / groups.length
  const groupKey = (name: string) => name.replace(/\s|组/g, '').toUpperCase()
  const ordered = [...groups].sort((a, b) =>
    groupKey(a.name) < groupKey(b.name) ? -1 : groupKey(a.name) > groupKey(b.name) ? 1 : 0,
  )
  const seeds = defaultGroupCrossing(
    ordered.map((group) => group.id),
    places,
  )
  if (
    first?.length === seeds.length &&
    groupStage &&
    groups.every((group) => group.stageId === groupStage) &&
    new Set(groups.map((group) => groupKey(group.name))).size === groups.length
  ) {
    plans.unshift({
      sourceStageId: groupStage,
      slots: seeds.flatMap(([home, away], index) => [
        { targetMatchId: first[index]!.id, side: 'HOME', source: { type: 'GROUP_RANK', ...home } },
        { targetMatchId: first[index]!.id, side: 'AWAY', source: { type: 'GROUP_RANK', ...away } },
      ]),
    })
  }
  return plans
}
