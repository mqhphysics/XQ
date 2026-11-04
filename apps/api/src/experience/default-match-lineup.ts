import { playerAvatar } from '../media/player-avatar'
export interface PublicRosterEntry {
  playerProfileId: string
  displayName: string
  shirtNumber: string | null
  playerProfile: { position: string | null; avatarUrl: string | null; portraitUrl?: string | null }
}

const positions: Record<string, string> = {
  GK: 'GOALKEEPER',
  DF: 'DEFENDER',
  MF: 'MIDFIELDER',
  FW: 'FORWARD',
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** A published team default is a preview; it never creates appearances or match statistics. */
export function defaultMatchLineup(entries: PublicRosterEntry[], publishedPayload?: unknown) {
  const lineup =
    object(publishedPayload) && object(publishedPayload.lineup) ? publishedPayload.lineup : null
  const selected = new Map<string, { x: number; y: number; label: string }>()
  const allowed = new Set(entries.map((entry) => entry.playerProfileId))
  const captainPlayerId =
    typeof lineup?.captainPlayerId === 'string' && allowed.has(lineup.captainPlayerId)
      ? lineup.captainPlayerId
      : null
  const emptySlots: Array<{ x: number; y: number; label: string }> = []
  let valid =
    !!lineup &&
    lineup.format === 8 &&
    typeof lineup.formation === 'string' &&
    Array.isArray(lineup.slots) &&
    lineup.slots.length === 8
  if (valid && lineup) {
    for (const item of lineup.slots as unknown[]) {
      if (
        !object(item) ||
        typeof item.label !== 'string' ||
        typeof item.x !== 'number' ||
        typeof item.y !== 'number' ||
        !Number.isFinite(item.x) ||
        !Number.isFinite(item.y) ||
        item.x < 0 ||
        item.x > 100 ||
        item.y < 0 ||
        item.y > 100
      ) {
        valid = false
        break
      }
      if (item.playerId === null) {
        emptySlots.push({ x: item.x, y: 100 - item.y, label: item.label })
        continue
      }
      if (
        typeof item.playerId !== 'string' ||
        !allowed.has(item.playerId) ||
        selected.has(item.playerId)
      ) {
        valid = false
        break
      }
      selected.set(item.playerId, { x: item.x, y: 100 - item.y, label: item.label })
    }
  }
  if (!valid) selected.clear()
  // A team preview must fill its eight positions from the existing roster.
  // This never creates a confirmed appearance or substitutes for match evidence.
  if (valid && selected.size > 0 && entries.length >= 8) {
    for (const slot of emptySlots) {
      const candidates = entries.filter((entry) => !selected.has(entry.playerProfileId))
      const selectedEntry =
        candidates.find(
          (entry) =>
            entry.playerProfile.position === positions[slot.label] &&
            (slot.label !== 'GK' || entry.playerProfileId !== captainPlayerId),
        ) ??
        candidates.find(
          (entry) => slot.label !== 'GK' || entry.playerProfileId !== captainPlayerId,
        ) ??
        candidates[0]
      if (selectedEntry) selected.set(selectedEntry.playerProfileId, slot)
    }
  }
  const hasDefault = valid && selected.size > 0
  return {
    formation: hasDefault ? String(lineup!.formation) : null,
    captainPlayerId,
    lineupSource: hasDefault
      ? ('TEAM_DEFAULT' as const)
      : entries.length
        ? ('TEAM_ROSTER' as const)
        : ('UNAVAILABLE' as const),
    appearanceRecorded: false,
    confirmedVersion: null,
    confirmedAt: null,
    players: entries.map((entry) => {
      const slot = hasDefault ? selected.get(entry.playerProfileId) : undefined
      return {
        id: entry.playerProfileId,
        displayName: entry.displayName,
        shirtNumber: entry.shirtNumber,
        position: slot
          ? (positions[slot.label] ?? entry.playerProfile.position)
          : entry.playerProfile.position,
        avatarUrl: playerAvatar(entry.playerProfile),
        starter: !!slot,
        minutesPlayed: null,
        pitchPosition: slot ? { x: slot.x, y: slot.y } : null,
      }
    }),
  }
}
