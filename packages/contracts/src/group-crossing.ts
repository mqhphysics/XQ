export type GroupSeed = { groupId: string; rank: number }

/** Adjacent groups cross; return fixtures in bracket order, with reciprocal games apart. */
export function defaultGroupCrossing(
  groupIds: string[],
  places: number,
): Array<[GroupSeed, GroupSeed]> {
  if (groupIds.length === 1 && places === 2)
    return [
      [
        { groupId: groupIds[0]!, rank: 1 },
        { groupId: groupIds[0]!, rank: 2 },
      ],
    ]
  if (![2, 4, 8].includes(groupIds.length) || ![1, 2].includes(places)) return []
  const first: Array<[GroupSeed, GroupSeed]> = [],
    second: Array<[GroupSeed, GroupSeed]> = []
  for (let index = 0; index < groupIds.length; index += 2) {
    const a = groupIds[index]!,
      b = groupIds[index + 1]!
    first.push([
      { groupId: a, rank: 1 },
      { groupId: b, rank: places },
    ])
    if (places === 2)
      second.push([
        { groupId: b, rank: 1 },
        { groupId: a, rank: 2 },
      ])
  }
  return [...first, ...second]
}

export function groupQualifierCount(document: unknown) {
  if (!document || typeof document !== 'object' || !('qualifiersPerGroup' in document))
    return undefined
  const count = document.qualifiersPerGroup
  return count === 1 || count === 2 ? count : undefined
}
