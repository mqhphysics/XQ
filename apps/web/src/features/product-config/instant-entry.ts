import { getConfiguration } from './policy-state'
import { productConfigRepository } from './product-config.repository'

export const instantCapabilities = () => productConfigRepository.getCapabilities()
export const instantConfiguration = () => getConfiguration()
export function warmEntryAnswers(): void {}
