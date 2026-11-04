import { apiRequest } from '../cloud-api/request'
import { readSession } from '../product/session'
import type { LineupPlayer } from './lineup.logic'

// Local integration types pending promotion by the contracts owner. No generated client edits.
export interface RosterWorkflowView {
  tournamentId: string
  tournamentName: string
  teamId: string
  teamName: string
  registrationId: string
  registrationStatus: string
  version: number
  status: string
  policy: {
    playersOnPitch: 5 | 7 | 8 | 11 | null
    minPlayers: number
    maxPlayers: number
    submissionDeadline: string
    ruleVersionId: string
  } | null
  decisionReason: string | null
  lockedSnapshot: { id: string; version: number; players: LineupPlayer[] } | null
  players: Array<{ playerId: string; displayName: string; shirtNumber: string | null }>
  availablePlayers: Array<{
    playerId: string
    displayName: string
    avatarUrl: string | null
    position: string | null
    eligible: boolean
  }>
}
export interface RosterCommand {
  action: 'SAVE' | 'SUBMIT'
  expectedVersion: number
  players: Array<{ playerId: string; shirtNumber: string | null }>
}
export class RosterApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}
export async function captainRequest<T>(
  path: string,
  command?: unknown,
  key?: string,
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
): Promise<T> {
  const session = readSession()
  if (!session) throw new RosterApiError('请先登录队长账号', 401)
  const configured = process.env.TARO_APP_API_BASE_URL?.trim().replace(/\/+$/, '')
  if (!configured) throw new RosterApiError('尚未配置 API 地址', 0)
  const base = configured.endsWith('/api') ? configured : `${configured}/api`
  const response = await apiRequest<T | { message?: string; error?: { message?: string } }>({
    url: `${base}${path}`,
    method: method ?? (command ? 'POST' : 'GET'),
    data: command,
    header: {
      'content-type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    timeout: 15000,
  })
  if (readSession()?.accessToken !== session.accessToken)
    throw new RosterApiError('账号已切换，请重新打开球队管理', 401)
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = response.data as { message?: string; error?: { message?: string } }
    throw new RosterApiError(
      error.message ?? error.error?.message ?? `名单请求失败（${response.statusCode}）`,
      response.statusCode,
    )
  }
  return response.data as T
}
const rosterPath = (tournamentId: string, teamId: string) =>
  `/roster/tournaments/${encodeURIComponent(tournamentId)}/teams/${encodeURIComponent(teamId)}`
export const rosterRepository = {
  review: (
    tournamentId: string,
    teamId: string,
    command: {
      action: 'RETURN' | 'APPROVE' | 'LOCK' | 'REOPEN'
      expectedVersion: number
      reason?: string
    },
    key: string,
  ) =>
    captainRequest<RosterWorkflowView>(
      `${rosterPath(tournamentId, teamId)}/commands`,
      command,
      key,
    ),
  read: (tournamentId: string, teamId: string) =>
    captainRequest<RosterWorkflowView>(rosterPath(tournamentId, teamId)),
  execute: (tournamentId: string, teamId: string, command: RosterCommand, key: string) =>
    captainRequest<RosterWorkflowView>(
      `${rosterPath(tournamentId, teamId)}/commands`,
      command,
      key,
    ),
}
