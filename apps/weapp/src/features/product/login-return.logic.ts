export function safeLoginReturn(url: string) {
  if (url.length > 1000 || /[\\\r\n]/.test(url)) return '/pages/index/index'
  const match =
    /^\/pages\/(readonly-match-detail|readonly-team-detail|player-detail|post-detail)\/index\?([^#]+)$/.exec(
      url,
    )
  if (!match) return '/pages/index/index'
  const idKey = {
    'readonly-match-detail': 'matchId',
    'readonly-team-detail': 'teamId',
    'player-detail': 'playerId',
    'post-detail': 'postId',
  }[match[1]!]
  const params = new URLSearchParams(match[2])
  const id = params.get(idKey!)
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return '/pages/index/index'
  const tournament = params.get('tournamentId')
  return (
    '/pages/' +
    match[1] +
    '/index?' +
    idKey +
    '=' +
    encodeURIComponent(id) +
    (tournament && /^[a-zA-Z0-9_-]+$/.test(tournament)
      ? '&tournamentId=' + encodeURIComponent(tournament)
      : '')
  )
}
