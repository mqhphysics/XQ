import { campusRepository, type Catalog } from '../campus/campus.repository.h5'
import { productRepository } from './product.repository'
import { readSession } from './session'
export function realTournaments(catalog: Catalog) {
  const seasons = new Set(
    catalog.seasons.filter((season) => !season.isDemo).map((season) => season.id),
  )
  return catalog.tournaments.filter((t) => seasons.has(t.seasonId) && t.status !== 'DRAFT')
}
export async function viewerDataTournament() {
  const catalog = await campusRepository.catalog(),
    available = realTournaments(catalog)
  const women = available.filter((t) =>
    /WOMEN|FEMALE|女/i.test(
      catalog.competitions.find((c) => c.id === t.competitionDefinitionId)?.gender || '',
    ),
  )
  const men = available.find((t) =>
    /^(?:MEN|MALE)$|男/i.test(
      catalog.competitions.find((c) => c.id === t.competitionDefinitionId)?.gender || '',
    ),
  )
  const playerId = readSession()?.user.linkedPlayer?.id
  if (playerId)
    for (const tournament of women) {
      const player = await productRepository.getPlayer(playerId, tournament.id)
      if (player.rosterSource === 'OFFICIAL_SNAPSHOT' && player.tournamentName === tournament.name)
        return tournament.id
    }
  return men?.id || available[0]?.id || ''
}
