export interface LineupPlayer {
  id: string
  displayName: string
  shirtNumber: string | null
  avatarUrl: string | null
  position: string | null
}
export interface LineupSlot {
  id: string
  label: string
  x: number
  y: number
  playerId: string | null
}
export interface LineupDraft {
  benchPlayerIds?: string[] | undefined
  schemaVersion: 1
  formation: string
  name: string
  custom: boolean
  slots: LineupSlot[]
}
export interface Formation {
  name: string
  format: 8
  rows: Array<{ labels: string[]; y: number }>
}
export const FORMATIONS: Formation[] = [
  {
    name: '3-3-1',
    format: 8,
    rows: [
      { labels: ['ST'], y: 20 },
      { labels: ['LM', 'CM', 'RM'], y: 43 },
      { labels: ['LCB', 'CB', 'RCB'], y: 69 },
      { labels: ['GK'], y: 88 },
    ],
  },
  {
    name: '3-2-2',
    format: 8,
    rows: [
      { labels: ['LS', 'RS'], y: 18 },
      { labels: ['LCM', 'RCM'], y: 42 },
      { labels: ['LCB', 'CB', 'RCB'], y: 68 },
      { labels: ['GK'], y: 88 },
    ],
  },
  {
    name: '2-3-2',
    format: 8,
    rows: [
      { labels: ['LS', 'RS'], y: 20 },
      { labels: ['LM', 'CM', 'RM'], y: 44 },
      { labels: ['LCB', 'RCB'], y: 69 },
      { labels: ['GK'], y: 88 },
    ],
  },
  {
    name: '2-4-1',
    format: 8,
    rows: [
      { labels: ['ST'], y: 20 },
      { labels: ['LM', 'LCM', 'RCM', 'RM'], y: 44 },
      { labels: ['LCB', 'RCB'], y: 69 },
      { labels: ['GK'], y: 88 },
    ],
  },
  {
    name: '2-2-3',
    format: 8,
    rows: [
      { labels: ['LW', 'ST', 'RW'], y: 18 },
      { labels: ['LCM', 'RCM'], y: 44 },
      { labels: ['LCB', 'RCB'], y: 69 },
      { labels: ['GK'], y: 88 },
    ],
  },
  {
    name: '3-1-3',
    format: 8,
    rows: [
      { labels: ['LW', 'ST', 'RW'], y: 18 },
      { labels: ['CM'], y: 44 },
      { labels: ['LCB', 'CB', 'RCB'], y: 68 },
      { labels: ['GK'], y: 88 },
    ],
  },
  {
    name: '4-2-1',
    format: 8,
    rows: [
      { labels: ['ST'], y: 18 },
      { labels: ['LCM', 'RCM'], y: 42 },
      { labels: ['LB', 'LCB', 'RCB', 'RB'], y: 68 },
      { labels: ['GK'], y: 88 },
    ],
  },
]

export function createFormation(name = '3-3-1', previous?: LineupDraft): LineupDraft {
  const formation = FORMATIONS.find((item) => item.name === name) ?? FORMATIONS[0]!
  const remaining =
    previous?.slots.flatMap((slot) =>
      slot.playerId ? [{ id: slot.playerId, label: slot.label }] : [],
    ) ?? []
  const assigned = new Set<string>()
  const slots = formation.rows.flatMap((row) =>
    row.labels.map((label, index) => ({
      id: label,
      label,
      x: row.labels.length === 1 ? 50 : 12 + (index * 76) / (row.labels.length - 1),
      y: row.y,
      playerId: null as string | null,
    })),
  )
  for (const slot of slots) {
    const match = remaining.find(
      (player) => player.label === slot.label && !assigned.has(player.id),
    )
    if (match) {
      slot.playerId = match.id
      assigned.add(match.id)
    }
  }
  for (const slot of slots) {
    if (slot.playerId) continue
    const match = remaining.find((player) => !assigned.has(player.id))
    if (match) {
      slot.playerId = match.id
      assigned.add(match.id)
    }
  }
  const bench = previous?.benchPlayerIds ? new Set(previous.benchPlayerIds) : null
  if (bench) {
    for (const player of remaining) if (!assigned.has(player.id)) bench.add(player.id)
    for (const id of assigned) bench.delete(id)
  }
  return {
    schemaVersion: 1,
    formation: formation.name,
    name: formation.name,
    custom: false,
    slots,
    benchPlayerIds: bench ? [...bench] : [],
  }
}

export function assignPlayer(
  draft: LineupDraft,
  playerId: string,
  targetId: string | null,
): LineupDraft {
  const slots = draft.slots.map((slot) => ({ ...slot }))
  const source = slots.find((slot) => slot.playerId === playerId)
  const target = slots.find((slot) => slot.id === targetId)
  if (targetId !== null && !target) return draft
  if (target && source === target) return draft
  const displaced = target?.playerId ?? null
  if (source) source.playerId = displaced
  if (target) target.playerId = playerId
  const bench = draft.benchPlayerIds ? new Set(draft.benchPlayerIds) : null
  if (bench) {
    bench.delete(playerId)
    if (targetId === null) bench.add(playerId)
    if (displaced && !source) bench.add(displaced)
    for (const slot of slots) if (slot.playerId) bench.delete(slot.playerId)
  }
  return { ...draft, slots, ...(bench ? { benchPlayerIds: [...bench] } : {}) }
}

export function moveSlot(draft: LineupDraft, slotId: string, x: number, y: number): LineupDraft {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return draft
  return {
    ...draft,
    custom: true,
    slots: draft.slots.map((slot) =>
      slot.id === slotId
        ? {
            ...slot,
            x: Math.round(Math.max(8, Math.min(92, x)) * 10) / 10,
            y: Math.round(Math.max(9, Math.min(91, y)) * 10) / 10,
          }
        : slot,
    ),
  }
}

export function clearStarters(draft: LineupDraft): LineupDraft {
  return {
    ...draft,
    slots: draft.slots.map((slot) => ({ ...slot, playerId: null })),
    benchPlayerIds: [
      ...new Set([
        ...(draft.benchPlayerIds ?? []),
        ...draft.slots.flatMap((slot) => (slot.playerId ? [slot.playerId] : [])),
      ]),
    ],
  }
}

export function groupLineupPlayers(draft: LineupDraft, players: LineupPlayer[]) {
  const starterIds = new Set(draft.slots.flatMap((slot) => (slot.playerId ? [slot.playerId] : [])))
  const substituteIds = new Set(draft.benchPlayerIds ?? [])
  return {
    starters: players.filter((player) => starterIds.has(player.id)),
    substitutes: players.filter(
      (player) => !starterIds.has(player.id) && substituteIds.has(player.id),
    ),
    unselected: players.filter(
      (player) => !starterIds.has(player.id) && !substituteIds.has(player.id),
    ),
  }
}

export function fillByPosition(draft: LineupDraft, players: LineupPlayer[]): LineupDraft {
  const used = new Set(draft.slots.map((slot) => slot.playerId).filter(Boolean))
  const slots = draft.slots.map((slot) => {
    if (slot.playerId) return slot
    const preferred =
      slot.label === 'GK'
        ? 'GOALKEEPER'
        : /B$/.test(slot.label)
          ? 'DEFENDER'
          : /M$/.test(slot.label)
            ? 'MIDFIELDER'
            : 'FORWARD'
    const player =
      players.find((candidate) => !used.has(candidate.id) && candidate.position === preferred) ??
      players.find((candidate) => !used.has(candidate.id))
    if (player) used.add(player.id)
    return { ...slot, playerId: player?.id ?? null }
  })
  return {
    ...draft,
    slots,
    ...(draft.benchPlayerIds
      ? { benchPlayerIds: draft.benchPlayerIds.filter((id) => !used.has(id)) }
      : {}),
  }
}

export function restoreDraft(value: unknown, players: LineupPlayer[]): LineupDraft | null {
  if (!value || typeof value !== 'object') return null
  const draft = value as Partial<LineupDraft>
  if (
    draft.schemaVersion !== 1 ||
    typeof draft.formation !== 'string' ||
    typeof draft.name !== 'string' ||
    !Array.isArray(draft.slots) ||
    draft.slots.length !== 8
  )
    return null
  const allowed = new Set(players.map((player) => player.id))
  const assigned = new Set<string>()
  const slotIds = new Set<string>()
  const slots: LineupSlot[] = []
  for (const raw of draft.slots) {
    if (
      !raw ||
      typeof raw.id !== 'string' ||
      typeof raw.label !== 'string' ||
      raw.label.length > 12 ||
      slotIds.has(raw.id) ||
      !Number.isFinite(raw.x) ||
      !Number.isFinite(raw.y)
    )
      return null
    slotIds.add(raw.id)
    const playerId =
      typeof raw.playerId === 'string' && allowed.has(raw.playerId) && !assigned.has(raw.playerId)
        ? raw.playerId
        : null
    if (playerId) assigned.add(playerId)
    slots.push({
      id: raw.id,
      label: raw.label,
      x: raw.x >= 0 && raw.x <= 100 ? raw.x : Math.max(8, Math.min(92, raw.x)),
      y: raw.y >= 0 && raw.y <= 100 ? raw.y : Math.max(9, Math.min(91, raw.y)),
      playerId,
    })
  }
  if (
    draft.benchPlayerIds !== undefined &&
    (!Array.isArray(draft.benchPlayerIds) ||
      !draft.benchPlayerIds.every((id) => typeof id === 'string'))
  )
    return null
  const benchPlayerIds = draft.benchPlayerIds
    ? [...new Set(draft.benchPlayerIds)].filter((id) => allowed.has(id) && !assigned.has(id))
    : undefined
  return {
    schemaVersion: 1,
    formation: draft.formation.slice(0, 32),
    name: draft.name.slice(0, 32),
    custom: draft.custom === true,
    slots,
    // Legacy drafts without an explicit bench never imply every registered player was selected.
    benchPlayerIds: benchPlayerIds ?? [],
  }
}

export function selectSavedLineupPlan<
  T extends { id: string; tournamentId: string | null; updatedAt: string; isDefault?: boolean },
>(plans: T[], tournamentId: string, preferredId: string): T | undefined {
  const relevant = plans.filter(
    (plan) => plan.tournamentId === null || plan.tournamentId === tournamentId,
  )
  return (
    relevant.find((plan) => plan.id === preferredId) ??
    relevant.find((plan) => plan.isDefault) ??
    relevant
      .slice()
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0]
  )
}

export function draftStorageKey(
  organizationId: string,
  userId: string,
  tournamentId: string,
  teamId: string,
): string {
  return `xiaoqiu.lineup.v1:${organizationId}:${userId}:${tournamentId}:${teamId}`
}
