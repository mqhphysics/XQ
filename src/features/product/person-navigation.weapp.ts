import { openNativeDetail } from '../native-navigation/index.weapp'
import { nativePersonUrl } from './native-profile.logic.weapp'
import { productRepository } from './product.repository'
export { openPlayer } from './player-navigation'

export function openPerson(userId: string, tournamentId = '') {
  return openNativeDetail(nativePersonUrl(userId, tournamentId), () =>
    productRepository.getPerson(userId, tournamentId || undefined),
  )
}
