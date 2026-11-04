import Taro from '@tarojs/taro'

export const OPEN_PLAYER_EVENT = 'xiaoqiu:open-player'
export const HOVER_PLAYER_EVENT = 'xiaoqiu:hover-player'
export const LEAVE_PLAYER_EVENT = 'xiaoqiu:leave-player'
export interface PlayerRequest {
  playerId: string
  tournamentId: string
}
export interface PlayerHoverRequest extends PlayerRequest {
  anchor: HTMLElement
}

export async function openPlayer(playerId: string, tournamentId = ''): Promise<void> {
  if (window.matchMedia('(min-width: 721px)').matches) {
    window.dispatchEvent(new CustomEvent(OPEN_PLAYER_EVENT, { detail: { playerId, tournamentId } }))
    return
  }
  await Taro.navigateTo({
    url: `/pages/player-detail/index?playerId=${encodeURIComponent(playerId)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
  })
}
