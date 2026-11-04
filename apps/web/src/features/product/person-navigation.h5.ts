export const OPEN_PERSON_EVENT = 'xiaoqiu:open-person'
export const HOVER_PERSON_EVENT = 'xiaoqiu:hover-person'
export interface PersonRequest {
  userId: string
  tournamentId: string
  mode?: 'coach'
}
export interface PersonHoverRequest extends PersonRequest {
  anchor: HTMLElement
}
export async function openPerson(userId: string, tournamentId = '', mode?: 'coach'): Promise<void> {
  if (!window.matchMedia('(min-width: 721px)').matches) return
  window.dispatchEvent(
    new CustomEvent(OPEN_PERSON_EVENT, { detail: { userId, tournamentId, mode } }),
  )
}
