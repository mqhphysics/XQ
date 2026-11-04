import Taro from '@tarojs/taro'

export async function openMatch(matchId: string, tournamentId = ''): Promise<void> {
  await Taro.navigateTo({
    url: `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(matchId)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
  })
}

export function openMatchFromUrl(_url: string): boolean {
  return false
}
