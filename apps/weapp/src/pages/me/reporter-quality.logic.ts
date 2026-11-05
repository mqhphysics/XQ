export interface QualitySeen {
  profileId: string
  entryId: string | null
  score: number
}
interface Entry {
  id: string
  delta: number
  scoreBefore: number
  scoreAfter: number
}
export interface QualityChange {
  from: number
  to: number
  delta: number
}
export function qualityChanges(
  profile: { id: string; score: number },
  entries: Entry[],
  seen: QualitySeen | null,
): QualityChange[] {
  const valid = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100
  if (!valid(profile.score)) return []
  const same = seen?.profileId === profile.id && valid(seen.score)
  if (same && seen.entryId === (entries[0]?.id || null) && seen.score === profile.score) return []
  const cursor = same ? entries.findIndex((e) => e.id === seen.entryId) : -1
  const fresh =
    cursor >= 0
      ? entries.slice(0, cursor)
      : same
        ? []
        : entries.slice(0, entries.findIndex((e) => e.delta !== 0) + 1)
  const changes = fresh
    .filter(
      (e) =>
        e.delta !== 0 &&
        valid(e.scoreBefore) &&
        valid(e.scoreAfter) &&
        e.scoreAfter - e.scoreBefore === e.delta,
    )
    .reverse()
    .map((e) => ({ from: e.scoreBefore, to: e.scoreAfter, delta: e.delta }))
  if (
    changes.length &&
    changes.at(-1)!.to === profile.score &&
    changes.every((e, i) => !i || changes[i - 1]!.to === e.from)
  )
    return changes
  if (same && seen.score !== profile.score)
    return [{ from: seen.score, to: profile.score, delta: profile.score - seen.score }]
  return []
}
