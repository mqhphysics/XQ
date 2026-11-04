import { createHash } from 'node:crypto'

import { requireInteger, requireRule } from './competition-rules'

export interface ProgressionSource {
  organizationId: string
  tournamentId: string
  stageId: string
  ruleVersionId: string
  // Eligible standings participants also matter when a team has not played a fixture yet.
  teams: Array<{ teamId: string; groupId: string | null }>
  // Include all source-stage fixtures, even those with no confirmed report (version 0).
  matches: Array<{
    matchId: string
    confirmedReportVersion: number
    homeTeamId: string | null
    awayTeamId: string | null
    groupId: string | null
  }>
}

export function progressionSourceHash(source: ProgressionSource): string {
  requireRule(
    [source.organizationId, source.tournamentId, source.stageId, source.ruleVersionId].every(
      (id) => id.trim().length > 0,
    ),
    'PROGRESSION_SCOPE_REQUIRED',
  )
  const seen = new Set<string>()
  const teamIds = new Set<string>()
  for (const team of source.teams) {
    requireRule(team.teamId.length > 0 && !teamIds.has(team.teamId), 'DUPLICATE_PROGRESSION_TEAM')
    teamIds.add(team.teamId)
  }
  for (const match of source.matches) {
    requireRule(
      match.matchId.length > 0 && !seen.has(match.matchId),
      'DUPLICATE_PROGRESSION_SOURCE',
    )
    seen.add(match.matchId)
    requireInteger(match.confirmedReportVersion, 'INVALID_RESULT_REVISION')
  }
  const matches = source.matches
    .map((match) => ({
      matchId: match.matchId,
      confirmedReportVersion: match.confirmedReportVersion,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      groupId: match.groupId,
    }))
    .sort((a, b) => (a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0))
  const teams = source.teams
    .map((team) => ({ teamId: team.teamId, groupId: team.groupId }))
    .sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0))
  return createHash('sha256')
    .update(
      JSON.stringify({
        format: 'xiaoqiu-progression-source-v1',
        organizationId: source.organizationId,
        tournamentId: source.tournamentId,
        stageId: source.stageId,
        ruleVersionId: source.ruleVersionId,
        teams,
        matches,
      }),
    )
    .digest('hex')
}
