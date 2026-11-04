import { readSession } from '../product/session'
export function competitionOrganizationKey() {
  return readSession()?.user.organizationId ?? process.env.TARO_APP_ORGANIZATION_ID ?? ''
}
export interface CompetitionSelection {
  competitionId: string
  seasonId: string
  tournamentId?: string | undefined
  competitionName: string
  seasonName: string
  isDemo: boolean
}
let selection: CompetitionSelection | null = null
let organization = ''
type Listener = (value: CompetitionSelection) => void
const listeners = new Set<Listener>()
/** Notified whenever any page (or the switcher) publishes a new selection. */
export function subscribeCompetitionSelection(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function readCompetitionSelection() {
  return organization === competitionOrganizationKey() ? selection : null
}
export function publishCompetitionSelection(value: CompetitionSelection) {
  const changed =
    !selection ||
    selection.competitionId !== value.competitionId ||
    selection.seasonId !== value.seasonId ||
    selection.tournamentId !== value.tournamentId
  selection = value
  organization = competitionOrganizationKey()
  try {
    localStorage.setItem(
      `xiaoqiu.competition-selection.v3:${organization}`,
      JSON.stringify({ competitionId: value.competitionId, seasonId: value.seasonId }),
    )
  } catch {
    /* Current selection remains usable without persistent storage. */
  }
  if (changed) for (const listener of [...listeners]) listener(value)
}
export function storedCompetitionSelection(): { competitionId?: string; seasonId?: string } {
  try {
    return JSON.parse(
      localStorage.getItem(`xiaoqiu.competition-selection.v3:${competitionOrganizationKey()}`) ??
        '{}',
    )
  } catch {
    return {}
  }
}
