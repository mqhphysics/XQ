import { openNativeDetail } from '../native-navigation/index.weapp'
import { productRepository } from './product.repository'
export function openMatch(matchId: string, tournamentId = '') {
  return openNativeDetail(
    `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(matchId)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    () => productRepository.getMatch(matchId),
  )
}
export function openMatchFromUrl(url: string) {
  if (!url.includes('/pages/readonly-match-detail/')) return false
  void openNativeDetail(url)
  return true
}
