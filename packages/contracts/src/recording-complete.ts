interface Goal {
  kind: unknown
  side: unknown
  playerId: unknown
  minute: unknown
  addedMinute?: unknown
  relatedPlayerId?: unknown
}
export function recordingScore(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (!/^\d{1,2}$/.test(String(value))) return null
  const score = Number(value)
  return score <= 99 ? score : null
}
/** Completion describes entered match facts; publication and review retain their own workflow. */
export function recordingComplete(home: unknown, away: unknown, events: readonly unknown[]) {
  const h = recordingScore(home),
    a = recordingScore(away)
  if (h === null || a === null) return false
  let homeGoals = 0,
    awayGoals = 0
  const seen = new Set<string>()
  for (const raw of events) {
    if (!raw || typeof raw !== 'object') return false
    const event = raw as Goal
    if (event.kind !== 'GOAL' && event.kind !== 'OWN_GOAL') continue
    if (
      (event.side !== 'HOME' && event.side !== 'AWAY') ||
      typeof event.playerId !== 'string' ||
      !event.playerId.trim() ||
      (typeof event.minute !== 'string' && typeof event.minute !== 'number') ||
      !/^\d{1,3}$/.test(String(event.minute)) ||
      Number(event.minute) > 120
    )
      return false
    const added = event.addedMinute ?? ''
    if (added !== '' && (!/^\d{1,2}$/.test(String(added)) || Number(added) > 30)) return false
    const key = JSON.stringify([
      event.kind,
      event.side,
      event.playerId,
      Number(event.minute),
      Number(added || 0),
      event.relatedPlayerId || '',
    ])
    if (seen.has(key)) return false
    seen.add(key)
    const beneficiary =
      event.kind === 'OWN_GOAL' ? (event.side === 'HOME' ? 'AWAY' : 'HOME') : event.side
    if (beneficiary === 'HOME') homeGoals++
    else awayGoals++
  }
  return homeGoals === h && awayGoals === a
}
