import Taro, { getCurrentInstance } from '@tarojs/taro'

export const OPEN_TEAM_EVENT = 'xiaoqiu:open-team'
export const HOVER_TEAM_EVENT = 'xiaoqiu:hover-team'
export const LEAVE_TEAM_EVENT = 'xiaoqiu:leave-team'
export const TEAM_PREFERENCES_EVENT = 'xiaoqiu:team-preferences-changed'

export function openDesktopTeam(teamId: string, tournamentId?: string): boolean {
  if (!window.matchMedia('(min-width: 721px)').matches) return false
  window.dispatchEvent(new CustomEvent(OPEN_TEAM_EVENT, { detail: { teamId, tournamentId } }))
  return true
}

export function openTeamFromUrl(url: string): boolean {
  const [path, query] = url.split('?')
  if (path !== '/pages/readonly-team-detail/index') return false
  const params = new URLSearchParams(query)
  const teamId = params.get('teamId')
  return Boolean(teamId && openDesktopTeam(teamId, params.get('tournamentId') ?? undefined))
}

export async function openTeam(teamId: string, tournamentId?: string): Promise<void> {
  if (openDesktopTeam(teamId, tournamentId)) return
  await Taro.navigateTo({
    url: `/pages/readonly-team-detail/index?teamId=${encodeURIComponent(teamId)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
  })
}

export function openTeamCrest(event: { target?: unknown }, teamId: string): boolean {
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('.public-team-nav, .mobile-team-tab, [data-team-action], [data-team-selector]')) return false
  // These entries already carry the correct tournament context in their handler.
  if (
    target?.closest(
      '.schedule-row__team, .schedule-primary-team, .player-team-link, .experience-scoreboard__team--linked, .search-result-row',
    )
  )
    return false
  const href = target?.closest('a')?.getAttribute('href')
  if (href && openTeamFromUrl(href)) return true
  const tournamentId = getCurrentInstance().router?.params?.tournamentId
  return openDesktopTeam(teamId, tournamentId)
}
