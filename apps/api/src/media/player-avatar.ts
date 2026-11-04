export function playerAvatar(player: { avatarUrl?: string | null; portraitUrl?: string | null }) {
  const value = player.avatarUrl?.trim()
  const path = value?.replace(/^(?:https?:)?\/\/[^/]+/i, '').split(/[?#]/)[0]
  return value &&
    !/^\/api\/media\/defaults\/(?:player|user)-avatar-\d{2}-v\d+\.webp$/.test(path || '')
    ? value
    : player.portraitUrl || null
}
