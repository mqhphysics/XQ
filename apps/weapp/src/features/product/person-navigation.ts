import { openPlayer } from './player-navigation'

export async function openPerson(userId: string, tournamentId = ''): Promise<void> {
  // Desktop people profiles are H5-only. Native callers keep their current flow.
  void userId
  void tournamentId
}
export { openPlayer }
