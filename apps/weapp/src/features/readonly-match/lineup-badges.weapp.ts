import type { PlayerMatchEvents } from './lineup.logic'
export function lineupBadges(events: PlayerMatchEvents | undefined) {
  const badges = (keys: readonly (keyof PlayerMatchEvents)[]) =>
    keys.flatMap((kind) =>
      (events?.[kind] || []).map((minute, index) => ({ kind, minute, id: kind + index })),
    )
  return {
    scores: badges(['goals', 'assists', 'ownGoals']),
    discipline: badges(['yellowCards', 'redCards', 'on', 'off']),
  }
}
