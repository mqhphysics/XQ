import { playerAvatar } from '../media/player-avatar'
export interface ConfirmedLineupPlanSource {
  kind: string
  organizationId: string
  teamId: string
  tournamentId: string | null
  confirmedVersion: number | null
  confirmedAt: Date | null
  confirmedRevision: {
    organizationId: string
    version: number
    payload: unknown
    rosterSnapshot: {
      organizationId: string
      teamId: string
      tournamentId: string
      lockedAt: Date | null
      entries: Array<{
        playerProfileId: string
        displayName: string
        shirtNumber: string | null
        playerProfile: {
          position: string | null
          avatarUrl?: string | null
          portraitUrl?: string | null
        }
      }>
    } | null
  } | null
}

interface Slot {
  slotId: string
  label: string
  playerId: string
  x: number
  y: number
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function slot(value: unknown): value is Slot {
  return (
    record(value) &&
    typeof value.slotId === 'string' &&
    value.slotId.length > 0 &&
    typeof value.label === 'string' &&
    typeof value.playerId === 'string' &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    value.x >= 0 &&
    value.x <= 100 &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y) &&
    value.y >= 0 &&
    value.y <= 100
  )
}

// The private head payload is deliberately absent from this input type.
export function confirmedMatchLineup(
  plan: ConfirmedLineupPlanSource | undefined,
  context: { organizationId: string; tournamentId: string; teamId: string },
) {
  const revision = plan?.confirmedRevision
  const snapshot = revision?.rosterSnapshot
  if (
    !plan ||
    plan.kind !== 'MATCH_LINEUP' ||
    !plan.confirmedAt ||
    !plan.confirmedVersion ||
    !revision ||
    revision.version !== plan.confirmedVersion ||
    !snapshot?.lockedAt ||
    [plan, revision, snapshot].some((item) => item.organizationId !== context.organizationId) ||
    plan.teamId !== context.teamId ||
    snapshot.teamId !== context.teamId ||
    plan.tournamentId !== context.tournamentId ||
    snapshot.tournamentId !== context.tournamentId ||
    !record(revision.payload) ||
    !record(revision.payload.lineup)
  )
    return null
  const lineup = revision.payload.lineup
  if (
    lineup.format !== 8 ||
    typeof lineup.formation !== 'string' ||
    !lineup.formation.trim() ||
    !Array.isArray(lineup.slots) ||
    lineup.slots.length !== 8 ||
    !lineup.slots.every(slot) ||
    !Array.isArray(lineup.benchPlayerIds) ||
    !lineup.benchPlayerIds.every((id): id is string => typeof id === 'string')
  )
    return null
  const slots = lineup.slots
  const playerIds = [...slots.map((item) => item.playerId), ...lineup.benchPlayerIds]
  const entries = new Map(snapshot.entries.map((entry) => [entry.playerProfileId, entry]))
  const captainPlayerId =
    typeof lineup.captainPlayerId === 'string' && entries.has(lineup.captainPlayerId)
      ? lineup.captainPlayerId
      : null
  if (
    new Set(slots.map((item) => item.slotId)).size !== 8 ||
    slots.filter((item) => item.label === 'GK').length !== 1 ||
    new Set(playerIds).size !== playerIds.length ||
    playerIds.some((id) => !entries.has(id))
  )
    return null
  const player = (id: string) => {
    const entry = entries.get(id)!
    return {
      id,
      displayName: entry.displayName,
      shirtNumber: entry.shirtNumber,
      position: entry.playerProfile.position,
      avatarUrl: playerAvatar(entry.playerProfile),
      minutesPlayed: null,
    }
  }
  return {
    formation: lineup.formation,
    captainPlayerId,
    lineupSource: 'CONFIRMED_MATCH_LINEUP' as const,
    appearanceRecorded: false,
    confirmedVersion: plan.confirmedVersion,
    confirmedAt: plan.confirmedAt.toISOString(),
    players: [
      ...slots.map((item) => ({
        ...player(item.playerId),
        position:
          (
            { GK: 'GOALKEEPER', DF: 'DEFENDER', MF: 'MIDFIELDER', FW: 'FORWARD' } as Record<
              string,
              string
            >
          )[item.label] ?? player(item.playerId).position,
        starter: true,
        pitchPosition: { x: item.x, y: 100 - item.y },
      })),
      ...lineup.benchPlayerIds.map((id) => ({
        ...player(id),
        starter: false,
        pitchPosition: null,
      })),
    ],
  }
}
