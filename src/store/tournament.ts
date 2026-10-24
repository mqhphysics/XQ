import Taro from '@tarojs/taro'

const TOURNAMENT_KEY = 'xiaoqiu.selected-tournament.v1'
let featuredTournamentId = ''
const listeners = new Set<(tournamentId: string) => void>()

export function rememberTournamentId(id: string | undefined): void {
  if (!id || id === featuredTournamentId) return
  featuredTournamentId = id
  try {
    Taro.setStorageSync(TOURNAMENT_KEY, id)
  } catch {
    /* Ignore storage write failure */
  }
  for (const listener of listeners) listener(id)
}

export function knownTournamentId(): string {
  if (featuredTournamentId) return featuredTournamentId
  try {
    const stored = Taro.getStorageSync<string | undefined>(TOURNAMENT_KEY)
    if (stored) featuredTournamentId = stored
  } catch {
    /* Ignore storage read failure */
  }
  return featuredTournamentId
}

export function subscribeTournamentChange(listener: (tournamentId: string) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetTournamentSelection(): void {
  featuredTournamentId = ''
  try {
    Taro.removeStorageSync(TOURNAMENT_KEY)
  } catch {
    /* Ignore storage clear failure */
  }
}
