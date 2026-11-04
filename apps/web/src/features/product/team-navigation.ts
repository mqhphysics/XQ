import Taro from '@tarojs/taro'

export function openTeamFromUrl(_url: string): boolean {
  return false
}

export async function openTeam(teamId: string, tournamentId?: string): Promise<void> {
  await Taro.navigateTo({
    url: `/pages/readonly-team-detail/index?teamId=${encodeURIComponent(teamId)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
  })
}

export function openTeamCrest(_event: { target?: unknown }, _teamId: string): boolean {
  return false
}

export function openDesktopTeam(_teamId: string, _tournamentId?: string): boolean {
  return false
}
