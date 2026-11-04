export type HubKind = 'team' | 'player'

export interface HubOrderKey {
  kind: HubKind
  id: string
}

export const FINISHED_MATCH_STATUSES = new Set(['FINISHED', 'CONFIRMED', 'ABANDONED'])
export const UPCOMING_MATCH_STATUSES = new Set(['SCHEDULED', 'CHECK_IN', 'LIVE', 'POSTPONED'])

const HUB_KEY = /^(team|player):.{1,150}$/

export function hubToken(key: HubOrderKey): string {
  return `${key.kind}:${key.id}`
}

export function parseHubOrder(raw: unknown): HubOrderKey[] {
  if (!Array.isArray(raw)) return []
  const keys: HubOrderKey[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const kind = 'kind' in item ? item.kind : null
    const id = 'id' in item ? item.id : null
    if ((kind !== 'team' && kind !== 'player') || typeof id !== 'string' || !id || id.length > 150)
      continue
    const token = hubToken({ kind, id })
    if (seen.has(token)) continue
    seen.add(token)
    keys.push({ kind, id })
  }
  return keys
}

export function parseHubOrderText(text: string | null | undefined): HubOrderKey[] {
  if (!text) return []
  try {
    return parseHubOrder(JSON.parse(text) as unknown)
  } catch {
    return []
  }
}

export function applyHubOrder<T extends { id: string }, P extends { id: string }>(
  teams: T[],
  players: P[],
  order: HubOrderKey[],
): Array<{ kind: 'team'; item: T } | { kind: 'player'; item: P }> {
  const teamMap = new Map(teams.map((team) => [team.id, team]))
  const playerMap = new Map(players.map((player) => [player.id, player]))
  const seen = new Set<string>()
  const result: Array<{ kind: 'team'; item: T } | { kind: 'player'; item: P }> = []
  for (const key of order) {
    const token = hubToken(key)
    if (seen.has(token) || !HUB_KEY.test(token)) continue
    if (key.kind === 'team') {
      const item = teamMap.get(key.id)
      if (!item) continue
      result.push({ kind: 'team', item })
      seen.add(token)
    } else {
      const item = playerMap.get(key.id)
      if (!item) continue
      result.push({ kind: 'player', item })
      seen.add(token)
    }
  }
  for (const item of teams) {
    const token = hubToken({ kind: 'team', id: item.id })
    if (seen.has(token)) continue
    result.push({ kind: 'team', item })
    seen.add(token)
  }
  for (const item of players) {
    const token = hubToken({ kind: 'player', id: item.id })
    if (seen.has(token)) continue
    result.push({ kind: 'player', item })
    seen.add(token)
  }
  return result
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length ||
    !Number.isInteger(from) ||
    !Number.isInteger(to)
  ) {
    return [...items]
  }
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (item === undefined) return [...items]
  next.splice(to, 0, item)
  return next
}

export function insertFollowKey(order: HubOrderKey[], key: HubOrderKey): HubOrderKey[] {
  const token = hubToken(key)
  if (order.some((item) => hubToken(item) === token)) return order
  return [...order, key]
}

export function removeFollowKey(order: HubOrderKey[], key: HubOrderKey): HubOrderKey[] {
  const token = hubToken(key)
  return order.filter((item) => hubToken(item) !== token)
}

export function pickSpotlightMatches<T extends { status: string; scheduledStartAt: string | null }>(
  matches: T[],
): T[] {
  const finished = matches
    .filter((match) => FINISHED_MATCH_STATUSES.has(match.status))
    .sort(byStartDescending)
  const upcoming = matches
    .filter((match) => UPCOMING_MATCH_STATUSES.has(match.status))
    .sort(byUpcoming)
  if (upcoming.length === 0) return finished.slice(0, 2)
  const cards: T[] = []
  if (finished[0]) cards.push(finished[0])
  if (upcoming[0]) cards.push(upcoming[0])
  if (cards.length < 2 && upcoming[1]) cards.push(upcoming[1])
  return cards.slice(0, 2)
}

export function spotlightKind(
  match: { status: string },
  index: number,
  cards: Array<{ status: string }>,
): 'finished' | 'upcoming' {
  const upcomingCount = cards.filter((item) => UPCOMING_MATCH_STATUSES.has(item.status)).length
  if (UPCOMING_MATCH_STATUSES.has(match.status)) return 'upcoming'
  if (upcomingCount === 0 && index === 0) return 'finished'
  return 'finished'
}

function byStartDescending(
  a: { scheduledStartAt: string | null },
  b: { scheduledStartAt: string | null },
): number {
  return (Date.parse(b.scheduledStartAt ?? '') || 0) - (Date.parse(a.scheduledStartAt ?? '') || 0)
}

function byUpcoming(
  a: { status: string; scheduledStartAt: string | null },
  b: { status: string; scheduledStartAt: string | null },
): number {
  if (a.status === 'LIVE' && b.status !== 'LIVE') return -1
  if (b.status === 'LIVE' && a.status !== 'LIVE') return 1
  return (
    (Date.parse(a.scheduledStartAt ?? '') || Number.POSITIVE_INFINITY) -
    (Date.parse(b.scheduledStartAt ?? '') || Number.POSITIVE_INFINITY)
  )
}
