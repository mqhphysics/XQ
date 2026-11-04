import Taro from '@tarojs/taro'

export async function openPlayer(playerId: string, tournamentId = ''): Promise<void> {
  await Taro.navigateTo({
    url: `/pages/player-detail/index?playerId=${encodeURIComponent(playerId)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
  })
}
