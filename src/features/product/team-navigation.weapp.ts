import { openNativeDetail } from '../native-navigation/index.weapp'
import { productRepository } from './product.repository'
export function openTeamFromUrl(url: string) {
  if (!url.includes('/pages/readonly-team-detail/')) return false
  void openNativeDetail(url)
  return true
}
export function openTeam(teamId: string, tournamentId = '') {
  return openNativeDetail(
    `/pages/readonly-team-detail/index?teamId=${encodeURIComponent(teamId)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    () => productRepository.getTeamDashboard(teamId, tournamentId || undefined),
  )
}
export function openTeamCrest(_event: { target?: unknown }, _teamId: string) {
  return false
}
export function openDesktopTeam(_teamId: string, _tournamentId?: string) {
  return false
}
