import { campusRepository } from '../../features/campus/campus.repository.h5'
import { productRepository } from '../../features/product/product.repository'
import { nativeFocusTournaments, type NativeFocusMatch } from './home-display.logic.weapp'

/** Reuse scored public schedules; the homepage shortlist cannot represent both finals. */
export async function loadNativeFocusPool(tournamentId: string): Promise<NativeFocusMatch[]> {
  const catalog = await campusRepository.catalog()
  const related = nativeFocusTournaments(catalog, tournamentId)
  const data = await Promise.all(
    related.map(async (item) => {
      const competition = await productRepository.getCompetitionData(item.id)
      return competition.schedule.map((match) => ({
        ...match,
        focusGender: item.gender,
        focusCupName: item.cupName,
      }))
    }),
  )
  return ([] as NativeFocusMatch[]).concat(...data)
}
