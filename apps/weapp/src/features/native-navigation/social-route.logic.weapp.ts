export type NativeSocialRoute = 'messages' | 'compose' | 'favorites'
const keys: Record<NativeSocialRoute, readonly string[]> = {
  messages: ['conversationId', 'userId', 'notificationId', 'category', 'new', 'private'],
  compose: ['tournamentId', 'teamId', 'quotePostId'],
  favorites: [],
}
const categories = ['messages', 'replies', 'mentions', 'likes', 'system', 'settings', 'blocked']
export function redirectedSocialUrl(url: string): string | null {
  if (url.length > 1600 || /[\\\r\n]/.test(url)) return null
  const hashAt = url.indexOf('#'),
    base = hashAt < 0 ? url : url.slice(0, hashAt),
    hash = hashAt < 0 ? '' : url.slice(hashAt)
  if (hash && !/^#[A-Za-z0-9_-]{1,100}$/.test(hash)) return null
  const [path, query = ''] = base.split('?')
  const route = /^\/(?:pages|social)\/(messages|compose|favorites)\/index$/.exec(
    path || '',
  )?.[1] as NativeSocialRoute | undefined
  if (!route) return null
  const values: Record<string, string> = {}
  try {
    for (const pair of query.split('&')) {
      const cut = pair.indexOf('=')
      if (cut < 0) continue
      const key = decodeURIComponent(pair.slice(0, cut)),
        value = decodeURIComponent(pair.slice(cut + 1))
      if (!keys[route].includes(key) || !value) continue
      if (key === 'category') {
        if (!categories.includes(value)) return null
      } else if (key === 'new' || key === 'private') {
        if (value !== '1') continue
      } else if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
      values[key] = value
    }
  } catch {
    return null
  }
  const next = keys[route]
    .filter((key) => values[key])
    .map((key) => `${key}=${encodeURIComponent(values[key]!)}`)
    .join('&')
  return `/social/${route}/index${next ? '?' + next : ''}${hash}`
}
export function nativeSocialUrl(
  route: NativeSocialRoute,
  params: Record<string, string | undefined> = {},
  hash = '',
) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value!)}`)
    .join('&')
  return redirectedSocialUrl(`/pages/${route}/index${query ? '?' + query : ''}${hash}`)
}
