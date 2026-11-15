export function rankScorers<T extends { goals: number }>(players: T[]) {
  const ordered = players.filter((player) => player.goals > 0).sort((a, b) => b.goals - a.goals)
  const cutoffGoals = ordered[9]?.goals ?? 0
  let rank = 1
  return ordered
    .filter((player) => player.goals >= cutoffGoals)
    .map((player, index) => {
      if (index > 0 && player.goals !== ordered[index - 1]!.goals) rank = index + 1
      return { ...player, rank }
    })
}
