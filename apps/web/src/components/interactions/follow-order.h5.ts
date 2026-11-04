export type FollowOrder = { teams: string[]; players: string[] }

const KEY = 'xiaoqiu.follow-order.v1'

export function emptyFollowOrder(): FollowOrder {
  return { teams: [], players: [] }
}

export function orderStorageKey(userId: string): string {
  return `${KEY}:${userId}`
}

function cleanIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

export function readFollowOrder(userId: string): FollowOrder {
  if (!userId || typeof window === 'undefined') return emptyFollowOrder()
  try {
    const raw = window.localStorage.getItem(orderStorageKey(userId))
    if (!raw) return emptyFollowOrder()
    const parsed = JSON.parse(raw) as Partial<FollowOrder>
    return { teams: cleanIds(parsed.teams), players: cleanIds(parsed.players) }
  } catch {
    return emptyFollowOrder()
  }
}

export function writeFollowOrder(userId: string, order: FollowOrder): void {
  if (!userId || typeof window === 'undefined') return
  window.localStorage.setItem(
    orderStorageKey(userId),
    JSON.stringify({ teams: order.teams, players: order.players }),
  )
}

/** Saved ids first, then any current ids the saved order does not mention. */
export function applyOrder<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const seen = new Set<string>()
  const ordered: T[] = []
  for (const id of ids) {
    const item = byId.get(id)
    if (item && !seen.has(id)) {
      ordered.push(item)
      seen.add(id)
    }
  }
  for (const item of items) {
    if (!seen.has(item.id)) ordered.push(item)
  }
  return ordered
}
