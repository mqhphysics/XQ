import type { CaptainWorkspaceResponse, TeamSummary } from '../product/product.types'
import { captainRequest } from './roster.repository'

export interface CaptainTeamProfile extends TeamSummary {
  description: string | null
  motto: string | null
  foundedYear: number | null
  coverUrl?: string | null
  updatedAt: string
}
export interface TeamProfileCommand {
  expectedUpdatedAt: string
  patch: Partial<{
    name: string
    shortName: string | null
    collegeName: string | null
    description: string | null
    motto: string | null
    primaryColor: string | null
    secondaryColor: string | null
    foundedYear: number | null
  }>
  reason: string
}
const teamPath = (teamId: string) => `/captain/teams/${encodeURIComponent(teamId)}`
export const teamManagementRepository = {
  read: (teamId: string) =>
    captainRequest<CaptainWorkspaceResponse & { team: CaptainTeamProfile }>(teamPath(teamId)),
  saveProfile: (teamId: string, input: TeamProfileCommand, key: string) =>
    captainRequest<CaptainTeamProfile>(`${teamPath(teamId)}/profile`, input, key, 'PUT'),
  updateMember: (
    teamId: string,
    memberId: string,
    position: string,
    expectedUpdatedAt: string,
    reason: string,
    key: string,
  ) =>
    captainRequest<CaptainWorkspaceResponse>(
      `${teamPath(teamId)}/members/${encodeURIComponent(memberId)}`,
      { position, expectedUpdatedAt, reason },
      key,
      'PUT',
    ),
  removeMember: (
    teamId: string,
    memberId: string,
    expectedUpdatedAt: string,
    reason: string,
    key: string,
  ) =>
    captainRequest<CaptainWorkspaceResponse>(
      `${teamPath(teamId)}/members/${encodeURIComponent(memberId)}`,
      { expectedUpdatedAt, reason },
      key,
      'DELETE',
    ),
}
