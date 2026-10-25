import type { LineupDraft } from './lineup.logic'

// Only migrate the old automatic layout; retain deliberately positioned tactics.
export function compactNativeFormation(draft: LineupDraft): LineupDraft {
  if (draft.custom) return draft
  const rows = new Map<number, typeof draft.slots>()
  for (const slot of draft.slots) rows.set(slot.y, [...(rows.get(slot.y) || []), slot])
  const positions = new Map<string, number>()
  for (const row of rows.values()) {
    const sorted = [...row].sort((a, b) => a.x - b.x)
    if (
      sorted.length < 2 ||
      !sorted.every((s, i) => Math.abs(s.x - (12 + (i * 76) / (sorted.length - 1))) < 0.01)
    )
      continue
    const xs =
      sorted.length === 2 ? [34, 66] : sorted.length === 3 ? [25, 50, 75] : [18, 39, 61, 82]
    sorted.forEach((slot, i) => positions.set(slot.id, xs[i]!))
  }
  return {
    ...draft,
    slots: draft.slots.map((slot) => ({ ...slot, x: positions.get(slot.id) ?? slot.x })),
  }
}

export interface NativeLineupBackup {
  schemaVersion: 1
  planId: string | null
  baseVersion: number
  name: string
  draft: LineupDraft
}
export const nativeLineupBackupKey = (
  organizationId: string,
  userId: string,
  teamId: string,
  tournamentId: string,
) =>
  `xiaoqiu.native-lineup.v1:${[organizationId, userId, teamId, tournamentId].map(encodeURIComponent).join(':')}`

export function readNativeLineupBackup(value: unknown): NativeLineupBackup | null {
  if (!value || typeof value !== 'object') return null
  const backup = value as Partial<NativeLineupBackup>
  return backup.schemaVersion === 1 &&
    (backup.planId === null || typeof backup.planId === 'string') &&
    Number.isInteger(backup.baseVersion) &&
    backup.baseVersion! >= 0 &&
    typeof backup.name === 'string' &&
    backup.draft
    ? (backup as NativeLineupBackup)
    : null
}
