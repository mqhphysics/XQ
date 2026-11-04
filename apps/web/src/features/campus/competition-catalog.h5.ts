import { useEffect, useRef, useState } from 'react'

import { campusRepository, type Catalog } from './campus.repository.h5'
import {
  competitionOrganizationKey,
  publishCompetitionSelection,
  readCompetitionSelection,
  subscribeCompetitionSelection,
  type CompetitionSelection,
} from './competition-selection.h5'
import { pickForTournament, type CompetitionPick } from './competition-switcher.logic.h5'

/** One catalog per organisation, shared by CampusContext and every CompetitionSwitcher. */
let cache: Catalog | null = null
let cacheOrganization = ''
let inflight: Promise<Catalog> | null = null
let inflightOrganization = ''

export function peekCompetitionCatalog(): Catalog | null {
  return cacheOrganization === competitionOrganizationKey() ? cache : null
}

export function loadCompetitionCatalog(force = false): Promise<Catalog> {
  const organization = competitionOrganizationKey()
  if (!force && cache && cacheOrganization === organization) return Promise.resolve(cache)
  if (inflight && inflightOrganization === organization) return inflight
  inflightOrganization = organization
  inflight = campusRepository
    .catalog()
    .then((data) => {
      if (competitionOrganizationKey() === organization) {
        cache = data
        cacheOrganization = organization
      }
      return data
    })
    .finally(() => {
      if (inflightOrganization === organization) inflight = null
    })
  return inflight
}

export function useCompetitionCatalog(): Catalog | null {
  const [catalog, setCatalog] = useState<Catalog | null>(peekCompetitionCatalog)
  useEffect(() => {
    let active = true
    loadCompetitionCatalog()
      .then((data) => {
        if (active) setCatalog(data)
      })
      .catch(() => {
        /* CampusContext owns the visible catalog error state. */
      })
    return () => {
      active = false
    }
  }, [])
  return catalog
}

export function selectionFromPick(pick: CompetitionPick): CompetitionSelection {
  return {
    competitionId: pick.competition.id,
    seasonId: pick.season.id,
    tournamentId: pick.tournament?.id,
    competitionName: pick.competition.name,
    seasonName: pick.season.name,
    isDemo: pick.season.isDemo,
  }
}

export function publishPick(pick: CompetitionPick) {
  publishCompetitionSelection(selectionFromPick(pick))
}

export function useCompetitionSelection(): CompetitionSelection | null {
  const [value, setValue] = useState(readCompetitionSelection)
  useEffect(() => {
    setValue(readCompetitionSelection())
    return subscribeCompetitionSelection(setValue)
  }, [])
  return value
}

/**
 * The tournament a scoped desktop page should show. The shared selection wins (so a switch
 * made on any page follows the user); a changed route tournament is adopted site-wide.
 */
export function useScopedTournamentId(routeTournamentId: string): string {
  const [id, setId] = useState(() => readCompetitionSelection()?.tournamentId || routeTournamentId)
  const [lastRoute, setLastRoute] = useState(routeTournamentId)
  useEffect(
    () =>
      subscribeCompetitionSelection((value) => {
        if (value.tournamentId) setId(value.tournamentId)
      }),
    [],
  )
  if (routeTournamentId !== lastRoute) {
    setLastRoute(routeTournamentId)
    if (routeTournamentId && routeTournamentId !== id) setId(routeTournamentId)
  }
  const mounted = useRef(false)
  useEffect(() => {
    // The first render already follows the selection (CampusContext adopted a deep link
    // when the page mounted); only a later route change is adopted here.
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (!routeTournamentId || readCompetitionSelection()?.tournamentId === routeTournamentId) return
    const catalog = peekCompetitionCatalog()
    const pick = catalog ? pickForTournament(catalog, routeTournamentId) : undefined
    if (pick) publishPick(pick)
  }, [routeTournamentId])
  return id
}
