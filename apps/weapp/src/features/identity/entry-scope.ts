import type { ScopedCapability } from '../../../../../packages/contracts/src/product-config'

export function canReportMatch(
  capability: ScopedCapability | undefined,
  organizationId: string,
  match: { id: string; tournamentId: string },
): boolean {
  return (
    capability?.enabled === true &&
    capability.scopes.some(
      (scope) =>
        (scope.type === 'ORGANIZATION' && scope.id === organizationId) ||
        (scope.type === 'TOURNAMENT' && scope.id === match.tournamentId) ||
        (scope.type === 'MATCH' && scope.id === match.id),
    )
  )
}

export function managedTeamIds(capability: ScopedCapability | undefined): string[] {
  return capability?.enabled === true
    ? [
        ...new Set(
          capability.scopes.filter((scope) => scope.type === 'TEAM').map((scope) => scope.id),
        ),
      ]
    : []
}
