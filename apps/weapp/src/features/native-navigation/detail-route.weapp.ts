export interface NativeDetailRoute {
  path: string
  params: Record<string, string>
}
const required: Record<string, string | null> = {
  '/pages/readonly-team-detail/index': 'teamId',
  '/pages/player-detail/index': 'playerId',
  '/pages/person-detail/index': 'userId',
  '/pages/readonly-match-detail/index': 'matchId',
  '/pages/post-detail/index': 'postId',
  '/pages/team-manage/index': 'teamId',
  '/pages/messages/index': null,
  '/pages/favorites/index': null,
  '/pages/compose/index': null,
}
export function parseNativeDetailUrl(url: string): NativeDetailRoute | null {
  const [path = '', query = ''] = url.split('?')
  if (!Object.prototype.hasOwnProperty.call(required, path)) return null
  const params: Record<string, string> = {}
  try {
    for (const piece of query.split('&').filter(Boolean)) {
      const cut = piece.indexOf('='),
        key = cut < 0 ? piece : piece.slice(0, cut)
      params[decodeURIComponent(key)] = decodeURIComponent(cut < 0 ? '' : piece.slice(cut + 1))
    }
  } catch {
    return null
  }
  const key = required[path]
  if (key && !params[key]?.trim()) return null
  return { path, params }
}
