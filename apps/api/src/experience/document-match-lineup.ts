import type { PublicRosterEntry } from './default-match-lineup'

const role: Record<string, string> = {
  GK: 'GOALKEEPER',
  DF: 'DEFENDER',
  MF: 'MIDFIELDER',
  FW: 'FORWARD',
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** Signed-sheet evidence is a read model, never a player identity, eligibility grant or minutes record. */
export function documentMatchLineup(
  entries: PublicRosterEntry[],
  evidence: unknown,
  context: { matchId: string; teamId: string; tournamentId: string },
) {
  if (
    !record(evidence) ||
    evidence.matchId !== context.matchId ||
    evidence.teamId !== context.teamId ||
    evidence.tournamentId !== context.tournamentId ||
    !record(evidence.lineup)
  )
    return null
  const data = evidence.lineup
  if (!Array.isArray(data.slots) || data.slots.length !== 8 || typeof data.formation !== 'string')
    return null
  const rows = data.formation.split('-').map(Number)
  const slots = data.slots
  if (
    rows.length !== 3 ||
    rows.some((n) => !Number.isInteger(n) || n < 1) ||
    rows.reduce((a, b) => a + b, 0) !== 7
  )
    return null
  if (
    ['GK', 'DF', 'MF', 'FW'].some(
      (label, i) =>
        slots.filter((s: unknown) => record(s) && s.label === label).length !==
        [1, ...rows][i],
    )
  )
    return null
  const roster = new Map(entries.map((e) => [e.playerProfileId, e]))
  const ids = new Set<string>()
  const starters = []
  for (const slot of slots) {
    if (
      !record(slot) ||
      typeof slot.label !== 'string' ||
      !role[slot.label] ||
      typeof slot.x !== 'number' ||
      typeof slot.y !== 'number' ||
      !Number.isFinite(slot.x) ||
      !Number.isFinite(slot.y) ||
      slot.x < 0 ||
      slot.x > 100 ||
      slot.y < 0 ||
      slot.y > 100
    )
      return null
    const entry = typeof slot.playerId === 'string' ? roster.get(slot.playerId) : undefined
    const pending =
      !entry &&
      slot.playerId === null &&
      slot.identityPending === true &&
      typeof slot.shirtNumber === 'string' &&
      /^\d{1,3}$/.test(slot.shirtNumber)
    if (!entry && !pending) return null
    const id =
      entry?.playerProfileId ?? `pending:${context.matchId}:${context.teamId}:${slot.shirtNumber}`
    if (ids.has(id)) return null
    ids.add(id)
    starters.push({
      id,
      displayName: entry?.displayName ?? `${slot.shirtNumber}号`,
      shirtNumber: entry?.shirtNumber ?? String(slot.shirtNumber),
      position: role[slot.label]!,
      avatarUrl: entry?.playerProfile.avatarUrl ?? null,
      starter: true,
      minutesPlayed: null,
      pitchPosition: { x: slot.x, y: 100 - slot.y },
      identityPending: !entry,
    })
  }
  const captainPlayerId =
    typeof data.captainPlayerId === 'string' && roster.has(data.captainPlayerId)
      ? data.captainPlayerId
      : null
  return {
    formation: data.formation,
    captainPlayerId,
    lineupSource: 'DOCUMENT_PREVIEW' as const,
    appearanceRecorded: false,
    confirmedVersion: null,
    confirmedAt: null,
    players: [
      ...starters,
      ...entries
        .filter((e) => !ids.has(e.playerProfileId))
        .map((e) => ({
          id: e.playerProfileId,
          displayName: e.displayName,
          shirtNumber: e.shirtNumber,
          position: e.playerProfile.position,
          avatarUrl: e.playerProfile.avatarUrl,
          starter: false,
          minutesPlayed: null,
          pitchPosition: null,
          identityPending: false,
        })),
    ],
  }
}
