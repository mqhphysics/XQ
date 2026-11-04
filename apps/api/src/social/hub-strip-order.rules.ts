export const HUB_STRIP_KINDS = ['team', 'player'] as const
export type HubStripKind = (typeof HUB_STRIP_KINDS)[number]

export interface HubStripItem {
  kind: HubStripKind
  id: string
}

export const HUB_STRIP_MAX_ITEMS = 64

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function sanitizeHubStripItems(
  raw: unknown,
  allowed: { teamIds: ReadonlySet<string>; playerIds: ReadonlySet<string> },
): HubStripItem[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const items: HubStripItem[] = []
  for (const entry of raw) {
    if (items.length >= HUB_STRIP_MAX_ITEMS) break
    if (!entry || typeof entry !== 'object') continue
    const kind = 'kind' in entry ? entry.kind : null
    const id = 'id' in entry ? entry.id : null
    if ((kind !== 'team' && kind !== 'player') || typeof id !== 'string' || !UUID.test(id)) continue
    if (kind === 'team' && !allowed.teamIds.has(id)) continue
    if (kind === 'player' && !allowed.playerIds.has(id)) continue
    const token = `${kind}:${id}`
    if (seen.has(token)) continue
    seen.add(token)
    items.push({ kind, id })
  }
  return items
}

export function sameHubStripItems(left: HubStripItem[], right: HubStripItem[]): boolean {
  if (left.length !== right.length) return false
  return left.every((item, index) => item.kind === right[index]?.kind && item.id === right[index]?.id)
}
