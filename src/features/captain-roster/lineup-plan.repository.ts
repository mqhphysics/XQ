import { captainRequest } from './roster.repository'
import type { LineupPlayer } from './lineup.logic'
export interface LineupPlanPayload {
  formation: string
  format: 8
  slots: Array<{ slotId: string; label: string; x: number; y: number; playerId: string | null }>
  benchPlayerIds: string[]
}
export interface LineupPlanView {
  id: string
  teamId: string
  name: string
  kind: 'TACTIC' | 'MATCH_LINEUP'
  tournamentId: string | null
  matchId: string | null
  rosterSnapshotId: string | null
  version: number
  isDefault: boolean
  confirmedVersion: number | null
  confirmedAt: string | null
  confirmedByUserId: string | null
  hasUnconfirmedChanges: boolean
  payload: LineupPlanPayload
  updatedAt: string
  snapshotPlayers: LineupPlayer[]
  rosterSnapshotVersion: number | null
}
export interface SaveLineupPlan {
  planId?: string
  name: string
  kind: 'TACTIC' | 'MATCH_LINEUP'
  expectedVersion: number
  tournamentId: string | null
  matchId: string | null
  rosterSnapshotId: string | null
  payload: LineupPlanPayload
}
export interface LineupPlanHistory {
  plan: LineupPlanView
  items: Array<{
    version: number
    payload: { name: string; kind: string; lineup: LineupPlanPayload }
    createdAt: string
  }>
  nextBeforeVersion: number | null
}
const path = (teamId: string) => `/captain/teams/${encodeURIComponent(teamId)}/lineup-plans`
export const lineupPlanRepository = {
  list: (teamId: string) => captainRequest<{ items: LineupPlanView[] }>(path(teamId)),
  save: (teamId: string, input: SaveLineupPlan, key: string) =>
    captainRequest<LineupPlanView>(path(teamId), input, key),
  publish: (
    teamId: string,
    planId: string,
    action: 'DEFAULT' | 'CONFIRM',
    expectedVersion: number,
    key: string,
  ) =>
    captainRequest<LineupPlanView>(
      `${path(teamId)}/${encodeURIComponent(planId)}/${action === 'DEFAULT' ? 'default' : 'confirm'}`,
      { expectedVersion },
      key,
    ),
  history: (teamId: string, planId: string) =>
    captainRequest<LineupPlanHistory>(`${path(teamId)}/${encodeURIComponent(planId)}/revisions`),
}
