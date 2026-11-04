export function ownsNativePlayer(
  user: { id: string; linkedPlayer?: { id: string } | null } | null,
  player: { id: string; person?: { id: string } | null } | null,
) {
  return (
    !!user && !!player && (user.linkedPlayer?.id === player.id || player.person?.id === user.id)
  )
}
export function nativePlayerPhotos(...sources: Array<string | null | undefined>) {
  return [
    ...new Set(sources.map(nativePlayerAvatarUrl).filter((source): source is string => !!source)),
  ]
}
export function nativePlayerAvatarUrl(source?: string | null) {
  const value = source?.trim()
  if (!value) return null
  // The shared API still returns stock illustrations for players. Uploaded media is retained.
  const pathname = value.split(/[?#]/)[0]!.replace(/^(?:https?:)?\/\/[^/]+/i, '')
  if (/^\/api\/media\/defaults\/(?:player|user)-avatar-\d{2}-v\d+\.webp$/i.test(pathname))
    return null
  return value
}
export function nativePlayerInitial(name: string) {
  const characters = Array.from(name.trim())
  return characters[characters.length - 1] || '球'
}
export function nativePersonUrl(userId: string, tournamentId = '') {
  return `/pages/person-detail/index?userId=${encodeURIComponent(userId)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`
}
