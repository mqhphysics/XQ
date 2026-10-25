import { openNativeDetail } from '../native-navigation/index.weapp'
import { productRepository } from './product.repository'
export function openPlayer(playerId: string, tournamentId = '') {
  return openNativeDetail(
    `/pages/player-detail/index?playerId=${encodeURIComponent(playerId)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    () => productRepository.getPlayer(playerId, tournamentId || undefined),
  )
}
