import Taro from '@tarojs/taro'

export const OPEN_CAPTAIN_MANAGE_EVENT = 'xiaoqiu:open-captain-manage'

export interface CaptainManageRequest {
  teamId: string
  tournamentId?: string
  teamName?: string
}

export interface CaptainManagePickerRequest {
  teams: Array<{ id: string; name: string }>
  tournamentId?: string
}

/** Open the desktop captain-management modal, or fall back to the full page on phone. */
export function openCaptainManage(request: CaptainManageRequest): void {
  if (typeof window === 'undefined') return
  const desktop = window.matchMedia('(min-width: 721px)').matches
  if (!desktop) {
    const params = new URLSearchParams()
    params.set('teamId', request.teamId)
    if (request.tournamentId) params.set('tournamentId', request.tournamentId)
    void Taro.navigateTo({ url: `/pages/my-team/index?${params.toString()}` })
    return
  }
  window.dispatchEvent(new CustomEvent(OPEN_CAPTAIN_MANAGE_EVENT, { detail: request }))
}

/** One team → open modal; several → ask the host to show a small picker first. */
export function openCaptainManageChooser(request: CaptainManagePickerRequest): void {
  if (!request.teams.length) return
  if (request.teams.length === 1) {
    openCaptainManage({
      teamId: request.teams[0]!.id,
      ...(request.tournamentId ? { tournamentId: request.tournamentId } : {}),
      teamName: request.teams[0]!.name,
    })
    return
  }
  if (typeof window === 'undefined') return
  const desktop = window.matchMedia('(min-width: 721px)').matches
  if (!desktop) {
    const params = new URLSearchParams()
    if (request.tournamentId) params.set('tournamentId', request.tournamentId)
    void Taro.navigateTo({
      url: `/pages/my-team/index${params.toString() ? `?${params.toString()}` : ''}`,
    })
    return
  }
  window.dispatchEvent(
    new CustomEvent(OPEN_CAPTAIN_MANAGE_EVENT, {
      detail: { picker: request } satisfies { picker: CaptainManagePickerRequest },
    }),
  )
}
