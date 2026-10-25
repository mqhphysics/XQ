export function ownsNativePlayer(
  user: { id: string; linkedPlayer?: { id: string } | null } | null,
  player: { id: string; person?: { id: string } | null } | null,
) {
  return (
    !!user && !!player && (user.linkedPlayer?.id === player.id || player.person?.id === user.id)
  )
}
export function nativePlayerPhotos(...sources: Array<string | null | undefined>) {
  return [...new Set(sources.filter((source): source is string => !!source?.trim()))]
}
export function nativePersonUrl(userId: string, tournamentId = '') {
  return `/pages/person-detail/index?userId=${encodeURIComponent(userId)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`
}
